/* Git is the authority, not a DOM attribute or URL parameter. MIT. */
import {mergeProject,copyFiles,filesEqual} from './merge.mjs';
import {ConflictError} from './github.mjs';
import {safeRepo,safeBranch,validSlug} from './core.mjs';
export class MergeRequired extends Error {
  constructor(result,snapshot,remote){super('Hay cambios incompatibles. Revisa ambas versiones antes de guardar.');this.result=result;this.snapshot=snapshot;this.remote=remote;}
}
export function role(info,viewOnly=false){return {read:true,write:!!info?.permissions?.push&&!viewOnly,admin:!!info?.permissions?.admin&&!viewOnly,organization:info?.owner?.type==='Organization',viewOnly};}
export function shareLink(base,{repo,branch,slug,view=false}){
  const url=new URL(base);url.search='';url.hash=new URLSearchParams({repo:safeRepo(repo),branch:safeBranch(branch),project:validSlug(slug),mode:view?'view':'edit'}).toString();return url.href;
}
export function parseShare(hash){
  try {const q=new URLSearchParams(hash.replace(/^#/,''));if(!q.has('repo'))return null;
    return {repo:safeRepo(q.get('repo')),branch:safeBranch(q.get('branch')||'main'),slug:validSlug(q.get('project')||'bienvenida'),view:q.get('mode')==='view'};
  }catch{return null;}
}
export async function synchronize(api,{repo,branch,slug,snapshot,original,files,write=false,message='AulaTeX: sincronización compartida'}){
  let base=copyFiles(original),local=copyFiles(files),snap=snapshot;
  for(let attempt=0;attempt<3;attempt++){
    const head=await api.head(repo,branch);
    if(head!==snap.sha){
      const remoteSnap=await api.snapshotAt(repo,head),remote=await api.loadProject(repo,remoteSnap,slug);
      const merged=mergeProject(base,local,remote);
      if(merged.conflicts.length)throw new MergeRequired(merged,remoteSnap,remote);
      local=merged.files;base=copyFiles(remote);snap=remoteSnap;
    }
    if(!write||filesEqual(local,base))return {snapshot:snap,files:local,original:base};
    try{
      const saved=await api.save(repo,branch,snap,slug,local,base,message);
      return {snapshot:saved,files:local,original:copyFiles(local)};
    }catch(e){
      if(!(e instanceof ConflictError))throw e;
      if(attempt===2)throw Error('El repositorio está cambiando muy rápido. Tus cambios siguen locales; vuelve a sincronizar dentro de unos segundos.');
    }
  }
}
