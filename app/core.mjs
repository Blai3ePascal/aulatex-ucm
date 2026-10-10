/* AulaTeX UCM — MIT. No network, storage or DOM side effects in this module. */
export const LIMITS = Object.freeze({files:500, file:20*1024*1024, project:80*1024*1024, text:1024*1024, zip:30*1024*1024});
export const ENGINES = ['pdflatex','xelatex','lualatex','markdown'];
export const enc = new TextEncoder();
export const dec = new TextDecoder('utf-8',{fatal:true});
export function validSlug(s){if(typeof s!=='string'||!(/^[a-z0-9][a-z0-9-]{0,63}$/).test(s))throw Error('Identificador: 1–64 letras minúsculas, números o guiones; sin espacios.');return s;}
export function safePath(s){
 if(typeof s!=='string'||!s||s.length>220||s.includes('\\')||s.startsWith('/')||s.endsWith('/'))throw Error('Ruta de archivo no válida: '+s);
 for(const p of s.split('/')) if(!/^[\p{L}\p{N}_][\p{L}\p{N}_. ()-]*$/u.test(p)||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' ')) throw Error('Nombre no admitido: '+s+' (sin rutas relativas, caracteres de control ni nombres ocultos).');
 return s;
}
export function safeRepo(s){if(typeof s!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/).test(s))throw Error('Escribe propietario/repositorio, por ejemplo Blai3ePascal/aulatex-proyectos.');return s;}
export function safeBranch(s){if(typeof s!=='string'||!s||s.length>180||s.includes('..')||s.includes('@{')||!(/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/).test(s)||s.endsWith('/')||s.endsWith('.lock'))throw Error('Rama no válida.');return s;}
export function safeSha(s){if(!/^[0-9a-f]{40}$/.test(s))throw Error('La revisión de GitHub no es válida.');return s;}
export function config(data, paths){
 if(!data||typeof data!=='object'||data.schema!==1||typeof data.title!=='string'||!data.title.trim()||data.title.length>160)throw Error('project.json no es válido (schema 1, title, main y engine).');
 safePath(data.main); const md=/\.(md|markdown)$/i.test(data.main); if(md?data.engine!=='markdown':(!data.main.toLowerCase().endsWith('.tex')||data.engine==='markdown'))throw Error('Usa principal .tex con motor LaTeX o .md/.markdown con motor markdown.');
 if(!ENGINES.includes(data.engine))throw Error('Motor no admitido.');
 if(paths&&!paths.includes(data.main))throw Error('El documento principal no existe: '+data.main);
 return {schema:1,title:data.title,main:data.main,engine:data.engine};
}
export function toB64(bytes){let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(str);}
export function fromB64(s){const b=atob(s.replace(/\s/g,''));return Uint8Array.from(b,c=>c.charCodeAt(0));}
export function textBytes(t){return enc.encode(t);}
export function isText(path){return /\.(tex|bib|sty|cls|bst|bbl|txt|md|markdown|csv|tsv|dat|json|tikz|pgf|cfg|def|bbx|cbx|lbx|ist)$/i.test(path);}
export function checkFiles(files){
 if(files.size>LIMITS.files)throw Error('Máximo '+LIMITS.files+' archivos por proyecto.');let total=0;
 for(const [name,file] of files){safePath(name);let n=file.bytes?.length??file.size??0;if(n>LIMITS.file)throw Error(name+': supera los 20 MiB.');total+=n;}
 if(total>LIMITS.project)throw Error('El proyecto supera los 80 MiB.');return total;
}
export function html(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function highlight(text){
 // Escape every token, never interpret project contents as HTML.
 return text.split(/(\\[^a-zA-Z\s]|\\[a-zA-Z@]+\*?|%[^\n]*|[{}\[\]$])/g).map(s=>{
  const cls=s.startsWith('%')?'comment':s.startsWith('\\')?'command':/^[{}\[\]$]$/.test(s)?'punct':'';
  return cls?'<span class="'+cls+'">'+html(s)+'</span>':html(s);
 }).join('')+'\n';
}
export function outline(text){return [...text.matchAll(/^\s*\\(chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^}\n]+)\}/gm)].map(m=>({kind:m[1],title:m[2],offset:m.index}));}
export function guessMain(files){
 if(files.has('main.tex'))return 'main.tex';
 const tex=[...files.keys()].filter(p=>p.endsWith('.tex')).sort();
 const document=tex.find(p=>{try{return /\\documentclass(?:\[|\{)/.test(dec.decode(files.get(p).bytes));}catch{return false;}});
 if(!tex.length){const md=[...files.keys()].filter(p=>/\.(md|markdown)$/i.test(p)).sort();if(md.length)return files.has('README.md')?'README.md':md[0];throw Error('No hay documento .tex ni .md en el proyecto.');}return document||tex[0];
}
export function projectPaths(tree,slug){const prefix='projects/'+validSlug(slug)+'/';return tree.filter(x=>x.path.startsWith(prefix)&&x.type==='blob').map(x=>({...x,path:x.path.slice(prefix.length)}));}
export function discover(tree){
 return tree.filter(x=>x.type==='blob'&&/^projects\/[a-z0-9][a-z0-9-]{0,63}\/project\.json$/.test(x.path)).map(x=>({slug:x.path.split('/')[1],sha:x.sha})).sort((a,b)=>a.slug.localeCompare(b.slug));
}
export function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
export function resultMatches(r,{id,sha,slug}){return !!r&&r.schema===1&&r.build_id===id&&r.source_sha===sha&&r.project===slug;}
export function explainHTTP(status,message){
 const hint={401:'El token no es válido o ha caducado.',403:'Revisa los permisos del token, la aprobación de la organización y los límites de API.',404:'No existe el recurso o el token no puede verlo. Revisa el repositorio y que hayas subido repo-proyectos.',409:'Hay cambios simultáneos. No se ha sobrescrito tu trabajo.',422:'GitHub ha rechazado la actualización. Puede haber cambios simultáneos, reglas de rama o un workflow no disponible.',429:'Límite de peticiones. Espera antes de volver a intentarlo.'}[status]||'GitHub no ha completado la operación.';
 return hint+(message?' ('+String(message).slice(0,200)+')':'');
}
