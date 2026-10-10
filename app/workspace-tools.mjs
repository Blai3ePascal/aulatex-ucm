import {isMarkdown} from './markdown.mjs';
import {parseImport,parseBibTeX,planImport,bibBlock,setupBibliography} from './bibliography.mjs';
import {dec,textBytes,safePath,checkFiles} from './core.mjs';

export function installWorkspaceTools(host){
 const {state,$,canWrite,writeGuard,notify,task,markDirty,renderMetadata,openFile,currentConfig,replaceSelection,download}=host;
 let space='',staged=[],editIndex=-1,pending=null,remoteNext=0,chat=null,chatRows=[],chatPage=1,chatLoading=false,nextChat=0,reply=null,editing=null,sendingNonce=null,publicConsent='';
 const element=(tag,text,className='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const stamp=()=>state.repo+'@'+state.branch+'/'+state.slug;
 const bibStatus=(text,error=false)=>{$('bib-status').textContent=text;$('bib-status').className='callout'+(error?' error':'');};
 const chatStatus=(text,error=false)=>{$('chat-status').textContent=text;$('chat-status').className=error?'error':'';};
 function bibAction(fn){return task(async()=>{try{return await fn();}catch(e){bibStatus(e.message,true);throw e;}});}
 function chatAction(fn){return task(async()=>{try{return await fn();}catch(e){chatStatus(e.message,true);throw e;}});}
 function library(strict=false){const entries=[],errors=[];for(const [path,file] of state.files){if(!path.toLowerCase().endsWith('.bib'))continue;try{entries.push(...parseBibTeX(dec.decode(file.bytes)).entries.map(e=>({...e,path})));}catch(e){errors.push(path+': '+e.message);}}
  if(strict&&errors.length)throw Error('Revisa primero la bibliografía existente: '+errors.join(' · '));return {entries,errors};
 }
 function renderLibrary(){
  const {entries,errors}=library(),q=$('bib-search').value.toLowerCase(),shown=entries.filter(e=>(e.key+' '+Object.values(e.fields).join(' ')).toLowerCase().includes(q));
  const list=$('bib-library');list.replaceChildren();$('bib-library-count').textContent=entries.length+' referencias · '+shown.length+' coincidencias'+(shown.length>200?' (primeras 200; afina la búsqueda)':'')+(errors.length?' · '+errors.join(' · '):'');
  for(const e of shown.slice(0,200)){
   const row=element('article',undefined,'reference-card');row.append(element('strong',e.fields.title||e.key),element('p',(e.fields.author||'Autor no indicado')+' · '+(e.fields.year||'Sin fecha'),'tiny'),element('code',e.key+' · '+e.path));
   const actions=element('div',undefined,'reference-actions'),cite=element('button','Citar'),copy=element('button','Copiar cita'),source=element('button','Abrir .bib');
   cite.disabled=!canWrite()||(!state.active.endsWith('.tex')&&!isMarkdown(state.active));cite.onclick=()=>{try{writeGuard();$('bibliography-dialog').close();replaceSelection(isMarkdown(state.active)?'[@'+e.key+']':'\\cite{'+e.key+'}');notify(isMarkdown(state.active)?'Clave [@'+e.key+'] insertada. La vista Markdown no resuelve citas Pandoc.':'Cita insertada: '+e.key+'. Guarda y compila para actualizar el PDF.');}catch(x){bibStatus(x.message,true);}};
   copy.onclick=()=>void navigator.clipboard.writeText('\\cite{'+e.key+'}').then(()=>bibStatus('Cita copiada.')).catch(x=>bibStatus(x.message,true));
   source.onclick=()=>{$('bibliography-dialog').close();openFile(e.path);};actions.append(cite,copy,source);row.append(actions);list.append(row);
  }
  $('bib-target-list').replaceChildren();for(const path of state.files.keys())if(path.endsWith('.bib')){const opt=element('option');opt.value=path;$('bib-target-list').append(opt);}
 }
 function renderStaged(){
  const list=$('bib-staged');list.replaceChildren();$('bib-staged-count').textContent=staged.length+' fichas · '+staged.filter(r=>r.selected).length+' seleccionadas';
  for(const [index,row] of staged.entries()){
   const box=element('article',undefined,'reference-card'),label=element('label',undefined,'check'),checkbox=element('input');checkbox.type='checkbox';checkbox.checked=row.selected;checkbox.onchange=()=>{row.selected=checkbox.checked;$('bib-staged-count').textContent=staged.length+' fichas · '+staged.filter(r=>r.selected).length+' seleccionadas';};
   label.append(checkbox,element('strong',row.entry.fields.title||row.entry.key));box.append(label,element('p',(row.entry.fields.author||'Autor no indicado')+' · '+(row.entry.fields.year||'Sin fecha'),'tiny'),element('code',row.entry.key));
   const edit=element('button','Revisar / editar ficha');edit.onclick=()=>{editIndex=index;$('bib-entry-editor').value=bibBlock(row.entry);$('bib-edit-box').open=true;$('bib-entry-editor').focus();};box.append(edit);list.append(box);
  }
 }
 function stage(result){staged=result.entries.map(entry=>({entry,selected:true}));editIndex=-1;$('bib-edit-box').open=false;renderStaged();bibStatus('Revisa las fichas y pulsa Añadir seleccionadas. '+(result.warnings||[]).join(' '));}
 $('bibliography').onclick=()=>{renderLibrary();renderStaged();$('bibliography-dialog').showModal();};
 $('bib-search').oninput=renderLibrary;
 $('bib-parse').onclick=()=>bibAction(async()=>stage(parseImport($('bib-paste').value)));
 $('bib-file').onchange=()=>bibAction(async()=>{
  const entries=[],warnings=[];try{for(const file of $('bib-file').files){if(file.size>5*1024*1024)throw Error(file.name+': supera 5 MiB.');const r=parseImport(await file.text());entries.push(...r.entries);warnings.push(...r.warnings);if(entries.length>2000)throw Error('Máximo 2000 referencias en una importación.');}if(entries.length)stage({entries,warnings});}finally{$('bib-file').value='';}
 });
 $('bib-select-all').onchange=()=>{staged.forEach(r=>r.selected=$('bib-select-all').checked);renderStaged();};
 $('bib-update-entry').onclick=()=>bibAction(async()=>{if(editIndex<0||!staged[editIndex])throw Error('Selecciona primero una ficha.');const parsed=parseImport($('bib-entry-editor').value,'bib');if(parsed.entries.length!==1)throw Error('La edición debe contener una sola referencia.');staged[editIndex].entry=parsed.entries[0];renderStaged();bibStatus('Ficha revisada. Aún no se ha añadido al proyecto.');});
 $('bib-add').onclick=()=>bibAction(async()=>{
  writeGuard();const selected=staged.filter(r=>r.selected).map(r=>r.entry);if(!selected.length)throw Error('Selecciona al menos una ficha.');
  const target=safePath($('bib-target').value.trim());if(!target.endsWith('.bib'))throw Error('El destino debe acabar en .bib.');
  const all=library(true).entries,current=state.files.has(target)?dec.decode(state.files.get(target).bytes):'',plan=planImport(current,selected,all);
  if(!confirm('Añadir '+plan.added.length+' referencias a '+target+'; omitir '+plan.duplicates.length+' duplicadas; renombrar '+plan.renamed.length+' claves. No se sobrescriben referencias previas. ¿Continuar?'))return;
  const next=new Map(state.files);next.set(target,{bytes:textBytes(plan.text)});checkFiles(next);state.files=next;
  renderMetadata();if(state.active===target)openFile(target);markDirty();renderLibrary();bibStatus('Añadidas '+plan.added.length+'; duplicadas omitidas '+plan.duplicates.length+'. '+plan.renamed.map(x=>x.from+' → '+x.to).join(', ')+'. Guarda en GitHub cuando termines.');
  staged=[];renderStaged();
 });
 $('bib-setup').onclick=()=>bibAction(async()=>{
  writeGuard();const cfg=currentConfig(),target=safePath($('bib-target').value.trim());if(!state.files.has(target))throw Error('Añade primero el archivo '+target+'.');
  const old=dec.decode(state.files.get(cfg.main).bytes),next=setupBibliography(old,target,$('bib-style').value);
  if(next===old){bibStatus('La bibliografía ya está preparada. El estilo existente se conserva.');return;}
  if(!confirm('Preparar biblatex en '+cfg.main+' sin reemplazar un estilo existente. ¿Continuar?'))return;
  state.files.set(cfg.main,{bytes:textBytes(next)});openFile(cfg.main);markDirty();bibStatus('Bibliografía preparada. Cita alguna referencia, guarda y compila (Biber se ejecuta cuando hace falta).');
 });
 $('bib-fetch').onclick=()=>bibAction(async()=>{
  writeGuard();if(!state.api||!state.repo)throw Error('Conecta tu repositorio para usar Actions. La importación de archivos funciona sin conexión.');
  const queries=$('bib-queries').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!queries.length||queries.length>20)throw Error('Escribe entre 1 y 20 identificadores o URL.');
  if(!confirm('Se consultarán estas referencias en sus fuentes públicas mediante GitHub Actions. No envíes datos privados ni enlaces con credenciales. ¿Enviar?'))return;
  const id=crypto.randomUUID(),context={repo:state.repo,project:state.slug,id};
  await state.api.dispatchBibliography(context.repo,state.repoInfo.default_branch,state.slug,queries,id);pending=context;remoteNext=Date.now()+30000;$('bib-request-id').value=id;
  $('bib-run-link').href='https://github.com/'+state.repo+'/actions/workflows/importar-bibliografia.yml';$('bib-run-link').hidden=false;
  bibStatus('Solicitud '+id+' enviada. Actions puede tardar varios minutos. Puedes cerrar este panel y consultar el resultado después.');
 });
 async function checkImport(){
  if(!state.api||!state.repo)throw Error('Conecta GitHub.');const id=$('bib-request-id').value.trim();const key=stamp(),repo=state.repo,result=await state.api.bibliographyResult(repo,id);
  if(key!==stamp())return;if(!result){bibStatus('Todavía no hay resultado. Consulta el workflow; también puede faltar el archivo importar-bibliografia.yml en el repositorio.');return;}
  if(result.schema!==1||result.request_id!==id||result.project!==state.slug||result.repository!==state.repo)throw Error('El resultado no corresponde a este proyecto y solicitud. No se importará.');
  pending=null;if(!result.items?.length){bibStatus('No se pudieron obtener referencias: '+(result.errors||[]).map(x=>x.error||String(x)).join(' · '),true);return;}
  const parsed=parseImport(JSON.stringify(result),'json');parsed.warnings.push(...(result.errors||[]).map(x=>x.query+': '+x.error));stage(parsed);
 }
 $('bib-check').onclick=()=>bibAction(checkImport);

 const visibleBody=body=>String(body||'').replace(/\n*<!-- aulatex-message:[a-zA-Z0-9-]{16,80} -->\s*$/,'');
 function clearReply(){reply=null;editing=null;sendingNonce=null;$('chat-reply').textContent='';$('chat-cancel-reply').hidden=true;$('chat-send').textContent='Enviar mensaje';}
 function renderChat(){
  const box=$('chat-messages'),nearEnd=box.scrollHeight-box.scrollTop-box.clientHeight<70,scroll=box.scrollTop;box.replaceChildren();
  for(const row of chatRows){
   const card=element('article',undefined,'chat-message'),top=element('div',undefined,'chat-message-head');
   top.append(element('strong',row.user?.login||'Usuario'),element('time',new Date(row.created_at).toLocaleString('es-ES')));
   const body=visibleBody(row.body);card.append(top,element('p',body,'chat-body'));
   const actions=element('div',undefined,'reference-actions');const answer=element('button','Responder');answer.disabled=!canWrite();answer.onclick=()=>{clearReply();reply=row;$('chat-reply').textContent='Respuesta a @'+row.user.login+': '+body.slice(0,90);$('chat-cancel-reply').hidden=false;$('chat-input').focus();};actions.append(answer);
   if(row.user?.login===state.user?.login&&canWrite()){
    const edit=element('button','Editar'),remove=element('button','Eliminar');edit.onclick=()=>{clearReply();editing=row;$('chat-input').value=body;$('chat-reply').textContent='Editando tu mensaje';$('chat-send').textContent='Guardar edición';$('chat-cancel-reply').hidden=false;$('chat-input').focus();};
    remove.onclick=()=>chatAction(async()=>{if(!confirm('¿Eliminar este mensaje de GitHub? Las notificaciones o copias que ya se enviaron no se retiran.'))return;await state.api.removeChat(state.repo,row.id);chatRows=chatRows.filter(x=>x.id!==row.id);renderChat();chatStatus('Mensaje eliminado.');});actions.append(edit,remove);
   }
   card.append(actions);box.append(card);
  }
  if(!chatRows.length)box.append(element('p','Todavía no hay mensajes. El primer envío iniciará la conversación.','empty'));
  box.scrollTop=nearEnd?box.scrollHeight:scroll;$('chat-older').disabled=chatPage<=1;
 }
 async function loadChat(older=false){
  if(chatLoading||!state.api||!state.repo)return;chatLoading=true;const key=stamp();
  try{
   if(!chat){const found=await state.api.findChat(state.repo,state.slug);if(key!==stamp())return;chat=found;}if(key!==stamp())return;
   if(!chat){renderChat();chatStatus('Sin conversación todavía. No se ha creado ninguna Issue al abrir este panel.');return;}
   const fresh=await state.api.chatIssue(state.repo,chat.number);if(key!==stamp())return;chat=fresh;
   if(!older){const last=Math.max(1,Math.ceil((chat.comments||0)/100));chatPage=Math.max(1,last-1);chatRows=[];
    for(let page=chatPage;page<=last;page++){const rows=await state.api.chatComments(state.repo,chat.number,page);if(key!==stamp())return;chatRows.push(...rows);}
   }else if(chatPage>1){const previous=chatPage-1,rows=await state.api.chatComments(state.repo,chat.number,previous);if(key!==stamp())return;chatPage=previous;chatRows=[...rows,...chatRows];}
   chatRows=[...new Map(chatRows.map(r=>[r.id,r])).values()].sort((a,b)=>a.id-b.id);
   $('chat-link').href='https://github.com/'+state.repo+'/issues/'+chat.number;$('chat-link').hidden=false;renderChat();chatStatus('Actualizado '+new Date().toLocaleTimeString('es-ES')+' · '+chatRows.length+' mensajes cargados. Recepción cada 30 s con el panel visible.');
  }finally{chatLoading=false;nextChat=Date.now()+Math.max(30,state.api?.pollSeconds||30)*1000;}
 }
 $('chat-toggle').onclick=()=>{
  const open=$('chat-drawer').hidden;$('chat-drawer').hidden=!open;$('chat-toggle').setAttribute('aria-expanded',String(open));document.body.classList.toggle('chat-open',open);
  if(open)void loadChat().catch(e=>chatStatus(e.message,true));
 };
 $('chat-close').onclick=()=>{$('chat-drawer').hidden=true;$('chat-toggle').setAttribute('aria-expanded','false');document.body.classList.remove('chat-open');};
 $('chat-refresh').onclick=()=>chatAction(()=>loadChat());$('chat-older').onclick=()=>chatAction(()=>loadChat(true));$('chat-cancel-reply').onclick=clearReply;
 $('chat-input').addEventListener('input',()=>{sendingNonce=null;});
 $('chat-input').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('chat-send').click();}});
 $('chat-send').onclick=()=>chatAction(async()=>{
  writeGuard();if(!state.api||!state.repo)throw Error('Conecta tu repositorio.');let text=$('chat-input').value.trim();if(!text)throw Error('Escribe un mensaje.');
  if(state.repoInfo?.private===false&&publicConsent!==stamp()){if(!confirm('Este repositorio es PÚBLICO: el mensaje podrá leerlo cualquier persona. ¿Publicar?'))return;publicConsent=stamp();}
  if(editing){const marker=String(editing.body).match(/<!-- aulatex-message:[a-zA-Z0-9-]{16,80} -->\s*$/)?.[0];await state.api.changeChat(state.repo,editing.id,text+(marker?'\n\n'+marker:''));}
  else{
   if(reply)text='@'+reply.user.login+' (en respuesta a #issuecomment-'+reply.id+')\n> '+visibleBody(reply.body).slice(0,400).replace(/\n/g,'\n> ')+'\n\n'+text;
   if($('chat-context').checked)text+='\n\nArchivo: `'+state.active+'` · revisión `'+state.snapshot.sha+'`'+(state.dirty?' · con cambios locales sin publicar':'');
   if(!chat)chat=await state.api.createChat(state.repo,state.slug);
   sendingNonce??=crypto.randomUUID();await state.api.sendChat(state.repo,chat.number,text,sendingNonce);
  }
  $('chat-input').value='';clearReply();await loadChat();$('chat-messages').scrollTop=$('chat-messages').scrollHeight;chatStatus('Mensaje guardado en GitHub.');
 });
 $('chat-export').onclick=()=>download(new Blob([chatRows.map(r=>'['+r.created_at+'] '+(r.user?.login||'Usuario')+'\n'+visibleBody(r.body)).join('\n\n')],{type:'text/plain;charset=utf-8'}),'chat-'+state.slug+'-mensajes-cargados.txt');
 $('focus-mode').onclick=()=>{const on=document.body.classList.toggle('focus-mode');$('focus-mode').setAttribute('aria-pressed',String(on));};
 setInterval(()=>{
  if(document.hidden||!navigator.onLine||state.busy||!state.api)return;
  if(!$('chat-drawer').hidden&&Date.now()>=nextChat)void loadChat().catch(e=>{nextChat=Math.max(Date.now()+60000,e.retryAt||0);chatStatus(e.message,true);});
  if(pending&&pending.repo===state.repo&&pending.project===state.slug&&$('bibliography-dialog').open&&Date.now()>=remoteNext){remoteNext=Date.now()+30000;void checkImport().catch(e=>{remoteNext=Math.max(Date.now()+60000,e.retryAt||0);bibStatus(e.message,true);});}
 },1000);
 // A clipper transfer is only a local preview. It never grants access or imports automatically.
 try{
  const q=new URLSearchParams(location.hash.slice(1)),payload=q.get('bib');
  if(payload){if(payload.length>200000)throw Error('Captura demasiado grande. Usa el archivo JSON.');
   const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));stage(parseImport(new TextDecoder().decode(bytes),'json'));renderLibrary();$('bibliography-dialog').showModal();
   q.delete('bib');history.replaceState(null,'',location.pathname+location.search+(q.size?'#'+q.toString():''));
  }
 }catch(e){bibStatus('No se pudo abrir la captura: '+e.message,true);}
 return {refresh(){
  const key=stamp();if(space&&space!==key){chat=null;chatRows=[];chatPage=1;clearReply();$('chat-input').value='';$('chat-link').hidden=true;$('chat-messages').replaceChildren();chatStatus('Proyecto cambiado. Abre o actualiza su conversación.');staged=[];editIndex=-1;pending=null;$('bib-request-id').value='';$('bib-paste').value='';$('bib-queries').value='';renderStaged();if(!state.repo)$('chat-close').click();}
  space=key;$('bib-add').disabled=state.busy||!canWrite();$('bib-setup').disabled=state.busy||!canWrite()||(()=>{try{return currentConfig().engine==='markdown';}catch{return true;}})();$('bib-fetch').disabled=state.busy||!state.api||!canWrite();$('bib-check').disabled=state.busy||!state.api;
  $('chat-send').disabled=state.busy||!state.api||!canWrite();$('chat-input').readOnly=!canWrite();$('chat-context').disabled=!canWrite();
 }};
}
