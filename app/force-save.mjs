/* Force save changes CONTENT only. It NEVER force-pushes or changes other projects/workflows. MIT. */
import {mergeProject,copyFiles,filesEqual} from './merge.mjs';
import {config,dec,checkFiles,same} from './core.mjs';
import {ConflictError} from './github.mjs';
export function forcePlan(base,local,remote){
 const result=mergeProject(base,local,remote),files=copyFiles(result.files);
 // Only incompatible files explicitly favour the local version. Compatible remote edits survive.
 for(const c of result.conflicts){if(c.local)files.set(c.path,{bytes:c.local.bytes.slice()});else files.delete(c.path);}
 checkFiles(files);config(JSON.parse(dec.decode(files.get('project.json')?.bytes||new Uint8Array())),[...files.keys()]);
 const changed=[...new Set([...files.keys(),...remote.keys()])].filter(p=>!files.has(p)||!remote.has(p)||!same(files.get(p).bytes,remote.get(p).bytes));
 const overwrites=result.conflicts.map(c=>({path:c.path,reason:c.reason,deleted:!c.local}));
 return {files,changed,overwrites,hasChanges:!filesEqual(files,remote)};
}
export async function prepareForce(api,{repo,branch,slug,original,files}){
 const snapshot=await api.snapshot(repo,branch),remote=await api.loadProject(repo,snapshot,slug);
 return {...forcePlan(original,files,remote),snapshot,remote};
}
export async function commitForce(api,{repo,branch,slug,plan}){
 // A race must trigger another review, not an automatic last-writer-wins retry.
 if(await api.head(repo,branch)!==plan.snapshot.sha)throw new ConflictError();
 if(!plan.hasChanges)return plan.snapshot;
 return api.save(repo,branch,plan.snapshot,slug,plan.files,plan.remote,'AulaTeX: '+slug+' · guardado inmediato confirmado'+(plan.overwrites.length?' · preferencia local en '+plan.overwrites.length+' archivo(s)':''));
}
