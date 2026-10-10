import {safeRepo,safeBranch,safeSha,toB64,fromB64,explainHTTP,projectPaths,validSlug,checkFiles,same} from './core.mjs';
export class APIError extends Error{constructor(status,message){super(explainHTTP(status,message));this.status=status;}}
export class ConflictError extends Error{constructor(){super('El repositorio ha cambiado desde que lo abriste. Tu edición sigue aquí. Exporta el ZIP, recarga y combina los cambios; no se ha sobrescrito nada.');}}
export class GitHub {
 #token; #queue=Promise.resolve(); #cache=new Map(); #blobs=new Map(); #lastWrite=0; #pauseUntil=0; #rateHits=0;
 pollSeconds=30; remaining=null;
 constructor(token){if(typeof token!=='string'||!token.trim())throw Error('Falta el token.');this.#token=token.trim();}
 close(){this.#token='';this.#cache.clear();this.#blobs.clear();}
 request(path,options={}){
  // Serialize all calls, including a compiler status poll interleaved with a save.
  const promise=this.#queue.then(()=>this.#request(path,options));
  this.#queue=promise.catch(()=>{});return promise;
 }
 async #request(path,{method='GET',body,signal}={}){
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('://')||/[\r\n\\]/.test(path))throw Error('Ruta API bloqueada.');
  if(!['GET','POST','PATCH','PUT','DELETE'].includes(method))throw Error('Método API no permitido.');
  if(!this.#token)throw Error('La sesión está cerrada.');
  if(Date.now()<this.#pauseUntil){const e=new APIError(429,'Pausa hasta '+new Date(this.#pauseUntil).toLocaleTimeString());e.retryAt=this.#pauseUntil;throw e;}
  if(method!=='GET'){
    const wait=Math.max(0,1100-(Date.now()-this.#lastWrite));
    if(wait)await new Promise(r=>setTimeout(r,wait));
    if(!this.#token)throw Error('La sesión está cerrada.');
    this.#lastWrite=Date.now();
  }
  const cached=method==='GET'?this.#cache.get(path):null;
  const response=await fetch('https://api.github.com'+path,{method,credentials:'omit',redirect:'error',cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.#token,'X-GitHub-Api-Version':'2026-03-10',...(cached?.etag?{'If-None-Match':cached.etag}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(45000)});
  const poll=Number(response.headers.get('x-poll-interval'));if(poll>0)this.pollSeconds=Math.max(30,poll);
  const remain=response.headers.get('x-ratelimit-remaining');if(remain!==null)this.remaining=Number(remain);
  if(response.status===304&&cached)return cached.data;
  if(!response.ok){
    let detail={};try{detail=await response.json();}catch{}
    const error=new APIError(response.status,detail.message);
    if(response.status===429||(response.status===403&&(this.remaining===0||/rate limit|secondary|abuse/i.test(detail.message||'')))){
      const retry=Number(response.headers.get('retry-after'))*1000,reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
      this.#pauseUntil=Math.max(Date.now()+Math.max(60000,retry||0)*2**Math.min(this.#rateHits++,4),this.remaining===0?reset:0);
      error.retryAt=this.#pauseUntil;
    }
    throw error;
  }
  this.#rateHits=0;
  if(method!=='GET')this.#cache.clear();
  if(response.status===204)return null;
  const text=await response.text(),data=text?JSON.parse(text):null;
  if(method==='GET'&&response.headers.get('etag')){
    if(this.#cache.size>100)this.#cache.clear();this.#cache.set(path,{data,etag:response.headers.get('etag')});
  }
  return data;
 }
 async user(){return this.request('/user');}
 async repos(){let all=[];for(let page=1;page<=10;page++){const r=await this.request('/user/repos?per_page=100&sort=updated&page='+page);all.push(...r);if(r.length<100)break;}return all.filter(r=>!r.archived);}
 prefix(repo){return '/repos/'+safeRepo(repo);}
 async repo(repo){return this.request(this.prefix(repo));}
 async head(repo,branch){return (await this.request(this.prefix(repo)+'/git/ref/heads/'+encodeURIComponent(safeBranch(branch)))).object.sha;}
 async snapshot(repo,branch){const head=await this.head(repo,branch);return this.snapshotAt(repo,head);}
 async snapshotAt(repo,sha){
  safeSha(sha);const c=await this.request(this.prefix(repo)+'/git/commits/'+sha);
  const t=await this.request(this.prefix(repo)+'/git/trees/'+c.tree.sha+'?recursive=1');
  if(t.truncated)throw Error('GitHub ha truncado el árbol. Divide el repositorio en varios espacios de trabajo.');
  return {sha,treeSha:c.tree.sha,tree:t.tree};
 }
 async blob(repo,sha){const key=repo+'@'+sha;if(this.#blobs.has(key))return this.#blobs.get(key).slice();const b=await this.request(this.prefix(repo)+'/git/blobs/'+safeSha(sha));if(b.encoding!=='base64')throw Error('Codificación de GitHub no admitida.');const bytes=fromB64(b.content);if(this.#blobs.size>=150)this.#blobs.clear();if(bytes.length<2*1024*1024)this.#blobs.set(key,bytes);return bytes.slice();}
 async loadProject(repo,snapshot,slug){
  const entries=projectPaths(snapshot.tree,slug),files=new Map();
  for(const f of entries){if(f.mode!=='100644'&&f.mode!=='100755')throw Error('No se admiten enlaces simbólicos: '+f.path);files.set(f.path,{size:f.size,sha:f.sha});}
  checkFiles(files);
  // Sequential requests avoid bursts and make usage predictable.
  for(const [path,f] of files) files.set(path,{sha:f.sha,bytes:await this.blob(repo,f.sha)});
  checkFiles(files);return files;
 }
 async save(repo,branch,snapshot,slug,files,original,message){
  validSlug(slug);checkFiles(files);const current=await this.head(repo,branch);
  if(current!==snapshot.sha)throw new ConflictError();
  const changes=[],prefix='projects/'+slug+'/';
  for(const [name,file] of files){
   const prev=original.get(name);if(prev&&same(file.bytes,prev.bytes))continue;
   const blob=await this.request(this.prefix(repo)+'/git/blobs',{method:'POST',body:{content:toB64(file.bytes),encoding:'base64'}});
   changes.push({path:prefix+name,mode:'100644',type:'blob',sha:blob.sha});
  }
  for(const name of original.keys())if(!files.has(name))changes.push({path:prefix+name,mode:'100644',type:'blob',sha:null});
  if(!changes.length)return snapshot;
  const tree=await this.request(this.prefix(repo)+'/git/trees',{method:'POST',body:{base_tree:snapshot.treeSha,tree:changes}});
  const commit=await this.request(this.prefix(repo)+'/git/commits',{method:'POST',body:{message:message||'AulaTeX: '+slug,tree:tree.sha,parents:[snapshot.sha]}});
  try{await this.request(this.prefix(repo)+'/git/refs/heads/'+encodeURIComponent(branch),{method:'PATCH',body:{sha:commit.sha,force:false}});}catch(e){if(e.status===409||e.status===422)throw new ConflictError();throw e;}
  return this.snapshotAt(repo,commit.sha);
 }
 async dispatch(repo,branch,{slug,sha,id}){
  return this.request(this.prefix(repo)+'/actions/workflows/compilar.yml/dispatches',{method:'POST',body:{ref:branch,inputs:{project:validSlug(slug),source_sha:safeSha(sha),build_id:id}}});
 }
 async runs(repo){return (await this.request(this.prefix(repo)+'/actions/workflows/compilar.yml/runs?event=workflow_dispatch&per_page=30')).workflow_runs;}
 async result(repo,slug){
  try{
   const meta=await this.request(this.prefix(repo)+'/contents/projects/'+validSlug(slug)+'/build.json?ref=aulatex-builds');
   return JSON.parse(new TextDecoder().decode(fromB64(meta.content)));
  }catch(e){if(e.status===404)return null;throw e;}
 }
 async history(repo,slug){return this.request(this.prefix(repo)+'/commits?per_page=20&path='+encodeURIComponent('projects/'+validSlug(slug)));}
 async collaborators(repo){let all=[];for(let page=1;page<=5;page++){const rows=await this.request(this.prefix(repo)+'/collaborators?per_page=100&page='+page);all.push(...rows);if(rows.length<100)return all;}throw Error('Más de 500 colaboradores. Consulta los permisos en GitHub.');}
 async invite(repo,username,permission,info){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username))throw Error('Escribe el nombre de usuario de GitHub, no su correo.');
  if(!info?.permissions?.admin)throw Error('Solo un administrador puede conceder permisos.');
  if(!['pull','push'].includes(permission))throw Error('Permiso no permitido.');
  if(permission==='pull'&&info.owner?.type!=='Organization')throw Error('GitHub no permite invitar solo para leer en un repositorio privado personal. Usa una organización.');
  return this.request(this.prefix(repo)+'/collaborators/'+encodeURIComponent(username),{method:'PUT',body:{permission}});
 }
 async revoke(repo,username){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username))throw Error('Usuario no válido.');
  return this.request(this.prefix(repo)+'/collaborators/'+encodeURIComponent(username),{method:'DELETE'});
 }
 async reviews(repo,slug){
  validSlug(slug);const q='repo:'+safeRepo(repo)+' is:issue in:title "[AulaTeX:'+slug+']"';
  return this.request('/search/issues?q='+encodeURIComponent(q)+'&sort=updated&order=desc&per_page=50');
 }
 async addReview(repo,slug,{title,body}){
  validSlug(slug);if(!title.trim()||title.length>120||!body.trim()||body.length>15000)throw Error('Escribe un título (hasta 120 caracteres) y un comentario (hasta 15000).');
  return this.request(this.prefix(repo)+'/issues',{method:'POST',body:{title:'[AulaTeX:'+slug+'] '+title,body}});
 }

 async findChat(repo,slug){
  validSlug(slug);const marker='<!-- aulatex-chat:v1 '+slug+' -->';
  for(let page=1;page<=20;page++){
   const rows=await this.request(this.prefix(repo)+'/issues?state=all&sort=created&direction=asc&per_page=100&page='+page);
   const matches=rows.filter(r=>!r.pull_request&&r.body?.includes(marker));
   if(matches.length)return matches.sort((a,b)=>a.number-b.number)[0];
   if(rows.length<100)return null;
  }
  throw Error('Más de 2000 Issues: no se puede descartar un chat anterior. Consulta el chat en GitHub antes de crear otro.');
 }
 async createChat(repo,slug){
  const found=await this.findChat(repo,slug);if(found)return found;
  const made=await this.request(this.prefix(repo)+'/issues',{method:'POST',body:{title:'[AulaTeX-chat:'+validSlug(slug)+'] Conversación del proyecto',body:'<!-- aulatex-chat:v1 '+slug+' -->\nChat compartido de AulaTeX UCM. Los mensajes son comentarios de esta Issue. Todos los usuarios con acceso al repositorio pueden leerlos. No es un chat privado personal.'}});
  // Two simultaneous first-open requests can create two Issues. Prefer the oldest.
  return await this.findChat(repo,slug)||made;
 }
 async chatIssue(repo,number){if(!Number.isSafeInteger(number)||number<1)throw Error('Número de conversación no válido.');return this.request(this.prefix(repo)+'/issues/'+number);}
 async chatComments(repo,number,page=1){if(!Number.isSafeInteger(number)||number<1||!Number.isSafeInteger(page)||page<1)throw Error('Página de chat no válida.');return this.request(this.prefix(repo)+'/issues/'+number+'/comments?per_page=100&page='+page);}
 async sendChat(repo,number,text,nonce){
  if(!text.trim()||text.length>8000)throw Error('El mensaje debe tener entre 1 y 8000 caracteres.');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(nonce))throw Error('Identificador de mensaje no válido.');
  const issue=await this.chatIssue(repo,number),last=Math.max(1,Math.ceil(issue.comments/100));
  const rows=await this.chatComments(repo,number,last);
  const marker='<!-- aulatex-message:'+nonce+' -->',prior=rows.find(r=>r.body?.endsWith(marker));if(prior)return prior;
  return this.request(this.prefix(repo)+'/issues/'+number+'/comments',{method:'POST',body:{body:text.trim()+'\n\n'+marker}});
 }
 async changeChat(repo,id,text){if(!Number.isSafeInteger(id)||id<1||!text.trim()||text.length>8500)throw Error('Comentario no válido.');return this.request(this.prefix(repo)+'/issues/comments/'+id,{method:'PATCH',body:{body:text}});}
 async removeChat(repo,id){if(!Number.isSafeInteger(id)||id<1)throw Error('Comentario no válido.');return this.request(this.prefix(repo)+'/issues/comments/'+id,{method:'DELETE'});}
 async dispatchBibliography(repo,branch,slug,queries,id){
  validSlug(slug);safeBranch(branch);if(!/^[A-Za-z0-9-]{16,80}$/.test(id)||!Array.isArray(queries)||!queries.length||queries.length>20||queries.some(q=>typeof q!=='string'||q.length>2000))throw Error('Solicitud bibliográfica no válida.');
  return this.request(this.prefix(repo)+'/actions/workflows/importar-bibliografia.yml/dispatches',{method:'POST',body:{ref:branch,inputs:{project:slug,request_id:id,queries:JSON.stringify(queries)}}});
 }
 async bibliographyResult(repo,id){
  if(!/^[A-Za-z0-9-]{16,80}$/.test(id))throw Error('Identificador no válido.');
  try{const data=await this.request(this.prefix(repo)+'/contents/imports/'+id+'.json?ref=aulatex-imports');if(!data.content)throw Error('Resultado bibliográfico vacío o demasiado grande.');return JSON.parse(new TextDecoder().decode(fromB64(data.content)));}catch(e){if(e.status===404)return null;throw e;}
 }

}
