/* AulaTeX bibliography: local, explicit imports; no browser requests to publishers.
 * Metadata is untrusted text. Never inject it into HTML or execute it as TeX code.
 * Bibliographic format subset and limits are described in docs/BIBLIOGRAFIA.md. MIT.
 */
export const BIB_LIMITS = Object.freeze({bytes: 5 * 1024 * 1024, entries: 2000});
const tidy = v => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
export function normalDOI(value) { return tidy(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi\s*:\s*/i, '').toLowerCase(); }
export function safeKey(value) { if (!/^[A-Za-z0-9][A-Za-z0-9:._+/-]{0,119}$/.test(value)) throw Error('Clave bibliográfica no válida: '+String(value).slice(0,120)); return value; }
export function latexEscape(value) {
 const codes={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','%':'\\%','$':'\\$','#':'\\#','&':'\\&','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'};
 return tidy(value).replace(/[\\{}%$#&_~^]/g,c=>codes[c]);
}
const norm = v => tidy(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function makeKey(record) {
 const surname=record.author?.[0]?.family || record.author?.[0]?.literal || record.author?.[0]?.name || 'ref';
 const year=record.issued?.['date-parts']?.[0]?.[0] || record.year || 'nd';
 return (norm(surname).slice(0,22)||'ref')+String(year).replace(/[^0-9]/g,'').slice(0,4)+(norm(record.title).slice(0,18)||'referencia');
}
export function bibBlock(entry) {
 safeKey(entry.key);if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(entry.type))throw Error('Tipo BibTeX no válido.');
 return '@'+entry.type+'{'+entry.key+',\n'+Object.entries(entry.fields).map(([key,val])=>{
  if(!/^[a-z][a-z0-9_-]*$/i.test(key))throw Error('Campo BibTeX no válido.');
  return '  '+key+' = {'+val+'}';
 }).join(',\n')+'\n}\n';
}
export function parseBibTeX(input) {
 const text=String(input).replace(/^\uFEFF/,'');if(new TextEncoder().encode(text).length>BIB_LIMITS.bytes)throw Error('La bibliografía supera 5 MiB.');
 let i=0;const entries=[],warnings=[],strings=Object.assign(Object.create(null),{jan:'January',feb:'February',mar:'March',apr:'April',may:'May',jun:'June',jul:'July',aug:'August',sep:'September',oct:'October',nov:'November',dec:'December'});
 const fail=msg=>{throw Error(msg+' (línea '+(text.slice(0,i).split('\n').length)+').');};
 const space=()=>{while(i<text.length){if(/\s/.test(text[i])){i++;continue;}if(text[i]==='%'){while(i<text.length&&text[i]!='\n')i++;continue;}break;}};
 const name=()=>{space();const m=/^[A-Za-z][A-Za-z0-9_-]*/.exec(text.slice(i));if(!m)fail('Se esperaba un nombre de campo');i+=m[0].length;return m[0].toLowerCase();};
 function atom(){
  space();let out='';
  if(text[i]==='{'){
   i++;let depth=1;while(i<text.length){const c=text[i++];if(c==='\\'){out+=c;if(i<text.length)out+=text[i++];continue;}if(c==='{')depth++;if(c==='}'){depth--;if(depth===0)return out;}
   out+=c;
  }fail('Llave de cierre ausente');
  }
  if(text[i]==='"'){
   i++;let depth=0;while(i<text.length){const c=text[i++];if(c==='\\'){out+=c;if(i<text.length)out+=text[i++];continue;}if(c==='{')depth++;if(c==='}')depth--;if(depth<0)fail('Llaves desequilibradas');if(c==='"'&&depth===0)return out;out+=c;}fail('Comilla de cierre ausente');
  }
  const m=/^[^\s,#})]+/.exec(text.slice(i));if(!m)fail('Se esperaba un valor');i+=m[0].length;
  if(/^\d+$/.test(m[0]))return m[0];
  const value=strings[m[0].toLowerCase()];if(value===undefined)fail('Macro BibTeX sin definir: '+m[0]);return value;
 }
 function value(){let out=atom();space();while(text[i]==='#'){i++;out+=atom();space();}return out;}
 while(i<text.length){
  space();if(i>=text.length)break;if(text[i]!=='@'){while(i<text.length&&text[i]!=='@')i++;continue;}
  i++;const type=name();space();const open=text[i++],close=open==='{'?'}':')';if(!['{','('].includes(open))fail('Entrada sin delimitador');
  if(type==='comment') {let depth=1;while(i<text.length&&depth){const c=text[i++];if(c==='\\'){i++;continue;}if(c===open)depth++;if(c===close)depth--;}if(depth)fail('Comentario sin cerrar');continue;}
  if(type==='preamble'){value();space();if(text[i]===',')i++;space();if(text[i++]!==close)fail('Preámbulo sin cerrar');warnings.push('Se ha omitido @preamble; revisa manualmente su necesidad antes de compilar.');continue;}
  if(type==='string'){const n=name();space();if(text[i++]!=='=')fail('Macro sin =');strings[n]=value();space();if(text[i]===',')i++;space();if(text[i++]!==close)fail('Macro sin cerrar');continue;}
  space();const keyStart=i;while(i<text.length&&![' ', '\t','\n','\r',',',close].includes(text[i]))i++;const key=safeKey(text.slice(keyStart,i));space();
  const fields=Object.create(null);if(text[i]===',')i++;else if(text[i]!==close)fail('Falta la coma tras la clave');
  while(i<text.length){space();if(text[i]===close){i++;break;}if(text[i]===','){i++;continue;}const n=name();space();if(text[i++]!=='=')fail('Campo sin =');if(n in fields)fail('Campo repetido: '+n);fields[n]=value();space();if(text[i]===','){i++;continue;}if(text[i]!==close)fail('Falta coma o cierre');}
  if(text[i-1]!==close)fail('Entrada sin cerrar');entries.push({type,key,fields});if(entries.length>BIB_LIMITS.entries)fail('Máximo 2000 referencias por importación');
 }
 return {entries,warnings};
}
const TYPES={'journal-article':'article','proceedings-article':'inproceedings','book-chapter':'incollection','article-journal':'article','article-magazine':'article','article-newspaper':'article',article:'article','paper-conference':'inproceedings',book:'book',chapter:'incollection',thesis:'phdthesis',report:'techreport',webpage:'misc',dataset:'misc',software:'misc',journalArticle:'article',bookSection:'incollection',conferencePaper:'inproceedings',computerProgram:'misc'};
export function metadataEntry(record) {
 if(!record||typeof record!=='object'||Array.isArray(record))throw Error('Referencia JSON no válida.');
 const r=record.data||record,fields=Object.create(null),put=(key,value)=>{if(value!==undefined&&value!==null&&tidy(value))fields[key]=latexEscape(value);};
 const creators=r.author || r.creators?.filter(x=>!x.creatorType||x.creatorType==='author').map(x=>x.name?{literal:x.name}:{family:x.lastName,given:x.firstName}) || [];
 if(!Array.isArray(creators))throw Error('Lista de autores no válida.');
 put('title',r.title||r.name||'Referencia sin título');
 if(creators.length)fields.author=creators.map(a=>a.literal||a.name?'{'+latexEscape(a.literal||a.name)+'}':latexEscape(a.family||'')+(a.given?', '+latexEscape(a.given):'')).filter(Boolean).join(' and ');
 const type=TYPES[r.type||r.itemType]||'misc';
 const year=r.issued?.['date-parts']?.[0]?.[0] || String(r.year||r.date||'').match(/\b\d{4}\b/)?.[0];put('year',year);
 const container=r['container-title']||r.publicationTitle||r.bookTitle;
 put(type==='inproceedings'||type==='incollection'?'booktitle':'journal',container);
 for(const [key,v] of Object.entries({volume:r.volume,number:r.issue,pages:r.page||r.pages,publisher:r.publisher,edition:r.edition,doi:normalDOI(r.DOI||r.doi),isbn:r.ISBN||r.isbn,issn:r.ISSN||r.issn,language:r.language,eprint:r.eprint,eprinttype:r.eprinttype||r.archivePrefix}))put(key,v);
 const url=tidy(r.URL||r.url);if(url){let u;try{u=new URL(url);}catch{throw Error('URL bibliográfica no válida.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('URL bibliográfica insegura.');put('url',u.href);}
 const accessed=r.accessed?.['date-parts']?.[0];if(accessed?.length===3)put('urldate',accessed.map((x,i)=>i?String(x).padStart(2,'0'):x).join('-'));
 const keyCandidate=r['citation-key']||r.citationKey;const key=keyCandidate?safeKey(keyCandidate):makeKey({...r,author:creators,year});
 return {type,key,fields};
}
export function parseRIS(input){
 const records=[];let current=null,last='';
 for(const line of String(input).replace(/^\uFEFF/,'').split(/\r?\n/)){
  const m=/^([A-Z0-9]{2})\s{2}-\s?(.*)$/.exec(line);
  if(m){const [,tag,v]=m;if(tag==='TY'){if(current)throw Error('RIS: falta ER antes de la siguiente referencia.');current=Object.create(null);}if(!current){if(line.trim())throw Error('RIS: falta TY.');continue;}
   if(tag==='ER'){records.push(current);current=null;last='';continue;}if(!current[tag])current[tag]=[];current[tag].push(v);last=tag;
  }else if(current&&last&&line.trim())current[last][current[last].length-1]+=' '+line.trim();
  else if(line.trim())throw Error('RIS: línea no reconocida.');
 }
 if(current)throw Error('RIS: la última referencia no termina con ER.');
 const type={JOUR:'article-journal',JFULL:'article-journal',BOOK:'book',CHAP:'chapter',CONF:'paper-conference',CPAPER:'paper-conference',THES:'thesis',RPRT:'report',ELEC:'webpage',DATA:'dataset'};
 return {entries:records.map(r=>{const first=k=>r[k]?.[0];return metadataEntry({type:type[first('TY')]||'webpage',title:first('TI')||first('T1'),author:(r.AU||r.A1||[]).map(n=>n.includes(',')?{family:n.split(',')[0].trim(),given:n.split(',').slice(1).join(',').trim()}:{literal:n}),date:first('PY')||first('Y1')||first('DA'),'container-title':first('JO')||first('JF')||first('T2'),publisher:first('PB'),volume:first('VL'),issue:first('IS'),page:[first('SP'),first('EP')].filter(Boolean).join('--'),DOI:first('DO'),ISBN:first('SN'),URL:first('UR')});}),warnings:[]};
}
export function parseImport(text,format='auto'){
 if(new TextEncoder().encode(text).length>BIB_LIMITS.bytes)throw Error('El archivo supera 5 MiB.');
 const s=String(text).replace(/^\uFEFF/,'').trim();if(!s)throw Error('No hay referencias para importar.');
 if(format==='auto')format=/^(?:\[|\{)/.test(s)?'json':/^TY\s{2}-/m.test(s)?'ris':'bib';
 let result;
 if(format==='bib')result=parseBibTeX(s);else if(format==='ris')result=parseRIS(s);else if(format==='json'){
  const data=JSON.parse(s);const rows=Array.isArray(data)?data:Array.isArray(data.items)?data.items:[data];
  const warnings=Array.isArray(data.warnings)?data.warnings.map(tidy):[];
  if(rows.length>BIB_LIMITS.entries)throw Error('Máximo 2000 referencias.');
  result={entries:rows.filter(x=>!['attachment','note'].includes((x.data||x).itemType)).map(metadataEntry),warnings};
 }else throw Error('Formato no compatible. Usa BibTeX, RIS o CSL JSON.');
 if(!result.entries.length)throw Error('No se han reconocido referencias.');if(result.entries.length>BIB_LIMITS.entries)throw Error('Máximo 2000 referencias.');return result;
}
const identityNorm=v=>tidy(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function fingerprint(e){const f=e.fields,doi=normalDOI(f.doi).replace(/\\([_%&#])/g,'$1');return doi?'doi:'+doi:'title:'+identityNorm(f.title)+'|'+identityNorm(f.author)+'|'+identityNorm(f.year);}
export function planImport(currentText,incoming,allProjectEntries=[]) {
 const current=currentText.trim()?parseBibTeX(currentText).entries:[];
 const used=new Set([...allProjectEntries,...current].map(e=>e.key));const seen=new Set([...allProjectEntries,...current].map(fingerprint)),added=[],duplicates=[],renamed=[];
 for(const entry of incoming){const e={...entry,fields:{...entry.fields}};const id=fingerprint(e);if(seen.has(id)){duplicates.push(e);continue;}const base=e.key;let n=2;while(used.has(e.key))e.key=base.slice(0,112)+'_'+n++;
  if(base!==e.key)renamed.push({from:base,to:e.key});used.add(e.key);seen.add(id);added.push(e);
 }
 return {added,duplicates,renamed,text:currentText+(currentText&&!currentText.endsWith('\n')?'\n':'')+(added.length?'\n% Referencias importadas con AulaTeX UCM\n'+added.map(bibBlock).join('\n'):'')};
}
export function setupBibliography(tex,path,style='numeric'){
 if(!/^[A-Za-z0-9][A-Za-z0-9_./-]*\.bib$/.test(path)||path.split('/').includes('..'))throw Error('Ruta .bib no válida.');
 if(!['numeric','authoryear','apa','ieee'].includes(style))throw Error('Estilo no admitido.');
 if(!/\\begin\{document\}/.test(tex)||!/\\end\{document\}/.test(tex))throw Error('Abre el documento principal con begin/end document.');
 if(/\\(?:bibliographystyle|bibliography)\b|\\usepackage(?:\[[^\]]*\])?\{[^}]*natbib/.test(tex))throw Error('El documento ya utiliza BibTeX/natbib. No lo convertimos automáticamente. Añade la bibliografía según su plantilla.');
 let out=tex;
 if(!/\\usepackage(?:\[[^\]]*\])?\{[^}]*biblatex/.test(out))out=out.replace(/\\begin\{document\}/,'\\usepackage[backend=biber,style='+style+']{biblatex}\n\\begin{document}');
 if(!out.includes('\\addbibresource{'+path+'}'))out=out.replace(/\\begin\{document\}/,'\\addbibresource{'+path+'}\n\\begin{document}');
 if(!/\\printbibliography\b/.test(out))out=out.replace(/\\end\{document\}/,'\\printbibliography\n\\end{document}');
 return out;
}
