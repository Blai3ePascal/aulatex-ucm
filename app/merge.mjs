/* AulaTeX v3. Conservative three-way merge. Independent implementation, MIT.
 * A=local, O=last acknowledged Git version, B=current Git version.
 * Compatible changes merge. Overlaps never use silent last-writer-wins.
 */
import {diffArrays} from '../vendor/jsdiff-5.2.0.mjs';
import {same, isText, dec, textBytes, checkFiles} from './core.mjs';
export const copyFiles = files => new Map([...files].map(([p,f])=>[p,{...f,bytes:f.bytes.slice()}]));
const equal = (a,b) => a===undefined||b===undefined ? a===b : same(a.bytes,b.bytes);
const lines = s => s.match(/[^\n]*\n|[^\n]+$/g)||[];
function edits(base,next) {
  // Bound worst-case quadratic work. Fall back to explicit resolution.
  const parts=diffArrays(base,next,{maxEditLength:1000,timeout:150});
  if(!parts) return null;
  let pos=0,current=null; const result=[];
  for(const part of parts){
    if(!part.added&&!part.removed){if(current){result.push(current);current=null;}pos+=part.count;continue;}
    current??={start:pos,end:pos,insert:[]};
    if(part.removed){pos+=part.count;current.end=pos;}else current.insert=current.insert.concat(part.value);
  }
  if(current)result.push(current);return result;
}
function overlap(a,b){
  const ai=a.start===a.end, bi=b.start===b.end;
  if(ai&&bi)return a.start===b.start;
  // Inserts touching the boundaries are deliberately conservative.
  if(ai)return a.start>=b.start&&a.start<=b.end;
  if(bi)return b.start>=a.start&&b.start<=a.end;
  return a.start<b.end&&b.start<a.end;
}
function identical(a,b){return a.start===b.start&&a.end===b.end&&a.insert.join('')===b.insert.join('');}
export function mergeText(base,local,remote){
  if(local===remote)return {ok:true,text:local};
  if(local===base)return {ok:true,text:remote};
  if(remote===base)return {ok:true,text:local};
  if(Math.max(base.length,local.length,remote.length)>1024*1024)return {ok:false,reason:'Texto demasiado grande para combinar automáticamente.'};
  const source=lines(base), a=edits(source,lines(local)), b=edits(source,lines(remote));
  if(!a||!b)return {ok:false,reason:'Demasiados cambios: se requiere revisión.'};
  const all=[...a];
  for(const edit of b){
    if(a.some(x=>identical(x,edit)))continue;
    if(a.some(x=>overlap(x,edit)))return {ok:false,reason:'Ambos habéis modificado la misma zona del texto.'};
    all.push(edit);
  }
  all.sort((x,y)=>x.start-y.start||x.end-y.end);
  let pos=0;const output=[];
  for(const edit of all){output.push(source.slice(pos,edit.start).join(''),edit.insert.join(''));pos=edit.end;}
  output.push(source.slice(pos).join(''));return {ok:true,text:output.join('')};
}
function mergeConfig(base,local,remote){
  try{
    const o=JSON.parse(dec.decode(base.bytes)),a=JSON.parse(dec.decode(local.bytes)),b=JSON.parse(dec.decode(remote.bytes));
    if(!o||!a||!b||[o,a,b].some(x=>typeof x!=='object'||Array.isArray(x)))return null;
    const out=Object.create(null);
    for(const key of new Set([...Object.keys(o),...Object.keys(a),...Object.keys(b)])){
      const O=JSON.stringify(o[key]),A=JSON.stringify(a[key]),B=JSON.stringify(b[key]);
      if(A===B||B===O){if(A!==undefined)out[key]=a[key];}
      else if(A===O){if(B!==undefined)out[key]=b[key];}
      else return null;
    }
    return {bytes:textBytes(JSON.stringify(out,null,2)+'\n')};
  }catch{return null;}
}
export function mergeProject(base,local,remote){
  checkFiles(base);checkFiles(local);checkFiles(remote);
  const files=new Map(), conflicts=[];
  for(const path of new Set([...base.keys(),...local.keys(),...remote.keys()])){
    const o=base.get(path),a=local.get(path),b=remote.get(path);
    if(equal(a,b)||equal(b,o)){if(a)files.set(path,{...a,bytes:a.bytes.slice()});continue;}
    if(equal(a,o)){if(b)files.set(path,{...b,bytes:b.bytes.slice()});continue;}
    let reason='Archivo creado, eliminado o modificado de forma incompatible.';
    if(o&&a&&b){
      if(path==='project.json'){
        const merged=mergeConfig(o,a,b);if(merged){files.set(path,merged);continue;}
        reason='La configuración ha cambiado de forma incompatible.';
      }else if(isText(path)){
        try{
          const merged=mergeText(dec.decode(o.bytes),dec.decode(a.bytes),dec.decode(b.bytes));
          if(merged.ok){files.set(path,{bytes:textBytes(merged.text)});continue;}reason=merged.reason;
        }catch{reason='El archivo no es texto UTF-8 válido.';}
      }else reason='Los dos habéis cambiado este archivo binario.';
    }
    conflicts.push({path,base:o,local:a,remote:b,reason});
    // Keep the local version visible, but never commit it until resolved.
    if(a)files.set(path,{...a,bytes:a.bytes.slice()});
  }
  return {files,conflicts};
}
export function filesEqual(a,b){return a.size===b.size&&[...a].every(([p,f])=>equal(f,b.get(p)));}
export function guessEngine(files){
  for(const [path,f] of files)if(path.endsWith('.tex')){
    let text;try{text=dec.decode(f.bytes);}catch{continue;}
    const magic=text.match(/^%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*(pdf|xe|lua)latex\b/im);
    if(magic)return magic[1]+'latex';
    if(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\bfontspec\b[^}]*\}/.test(text))return 'xelatex';
  }return [...files.keys()].some(p=>/\.tex$/i.test(p))?'pdflatex':[...files.keys()].some(p=>/\.(md|markdown)$/i.test(p))?'markdown':'pdflatex';
}
