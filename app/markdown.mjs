/* GFM rendering: raw HTML is always text; only known links and local raster images. MIT. */
import {Marked} from '../vendor/marked-4.0.19.mjs';
import {html,safePath} from './core.mjs';
export const MARKDOWN_LIMIT=200000;
export function isMarkdown(path){return /\.(md|markdown)$/i.test(path||'');}
function decodeEntities(s){return String(s).replace(/&#(x[0-9a-f]+|\d+);?|&(colon|tab|newline|amp);/gi,(_,n,named)=>n?String.fromCodePoint(Math.min(0x10ffff,parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10))):({colon:':',tab:'\t',newline:'\n',amp:'&'}[named.toLowerCase()]));}
export function safeMarkdownLink(href){
 const s=decodeEntities(href).trim();if(/[\x00-\x20\x7f\\]/.test(s))return null;
 if(/^#aulatex-md-\d+$/.test(s))return s;
 try{const u=new URL(s);if(!['https:','http:','mailto:'].includes(u.protocol)||u.username||u.password)return null;return u.href;}catch{return null;}
}
export function imagePath(href,active='documento.md'){
 try{const s=decodeURIComponent(String(href));if(/[?#:\\]/.test(s)||s.startsWith('/'))return null;const dir=active.includes('/')?active.slice(0,active.lastIndexOf('/')+1):'';const p=safePath(dir+s.replace(/^\.\//,''));return /\.(png|jpe?g|gif|webp)$/i.test(p)?p:null;}catch{return null;}
}
export function markdownOutline(text){
 let offset=0,fence=null;const rows=[];for(const line of String(text).split('\n')){const f=/^ {0,3}(`{3,}|~{3,})/.exec(line);if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence=null;}else if(!fence){const m=/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);if(m)rows.push({kind:'h'+m[1].length,title:m[2],offset});}offset+=line.length+1;}return rows;
}
export function markdownHighlight(text){let fence=false;return String(text).split('\n').map(line=>{let cls='';if(/^ {0,3}(`{3,}|~{3,})/.test(line)){fence=!fence;cls='command';}else if(fence)cls='comment';else if(/^ {0,3}#{1,6}\s/.test(line))cls='command';else if(/^\s*>/.test(line))cls='comment';return cls?'<span class="'+cls+'">'+html(line)+'</span>':html(line);}).join('\n')+'\n';}
export function renderMarkdown(text,{images={},active='documento.md'}={}){
 if(typeof text!=='string'||text.length>MARKDOWN_LIMIT)throw Error('Vista previa limitada a 200 000 caracteres. Puedes seguir editando y guardar el archivo o el ZIP.');
 const renderer=new Marked.Renderer(),headings=[];let n=0;
 renderer.html=raw=>html(raw); // never execute embedded HTML, scripts, SVG, event handlers or forms
 renderer.heading=(inner,level,raw)=>{const id='aulatex-md-'+(++n);headings.push({id,level,text:raw});return '<h'+level+' id="'+id+'">'+inner+'</h'+level+'>\n';};
 renderer.link=(href,title,inner)=>{const url=safeMarkdownLink(href);return url?'<a href="'+html(url)+'"'+(url[0]==='#'?'':' target="_blank" rel="noopener noreferrer"')+(title?' title="'+html(title)+'"':'')+'>'+inner+'</a>':inner+' <span class="md-blocked">[enlace no permitido]</span>';};
 renderer.image=(href,title,alt)=>{const path=imagePath(href,active),src=path&&Object.hasOwn(images,path)?images[path]:null;
  if(typeof src!=='string'||!(/^(blob:|data:image\/(png|jpeg|gif|webp);base64,)/.test(src)))return '<span class="md-blocked">[Imagen: '+html(alt||href)+' · añade un PNG/JPG/GIF/WebP al proyecto]</span>';
  return '<img src="'+html(src)+'" alt="'+html(alt)+'"'+(title?' title="'+html(title)+'"':'')+' loading="lazy">';};
 renderer.checkbox=checked=>'<input type="checkbox" disabled aria-label="Tarea '+(checked?'completada':'pendiente')+'"'+(checked?' checked':'')+'> ';
 const output=Marked.parse(text,{gfm:true,breaks:false,mangle:false,headerIds:false,renderer});
 return {html:output,headings};
}
export function standaloneMarkdown(title,body){return '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><meta name="referrer" content="no-referrer"><title>'+html(title)+'</title><style>body{margin:0 auto;max-width:78ch;padding:2rem;color:#1e1e1e;background:#fff;font:19px/1.65 Georgia,serif}h1,h2,h3{line-height:1.3}h1{border-bottom:3px solid #b71234;padding-bottom:1rem}a{color:#99112c;text-underline-offset:3px}pre,code{font-family:ui-monospace,Consolas,monospace}pre{padding:1rem;background:#f0eeeb;overflow:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #777;padding:.5rem 1rem}blockquote{border-left:3px solid #b71234;padding-left:1rem;margin-left:0}img{max-width:100%;height:auto}a:focus-visible{outline:3px solid #b71234}.md-blocked{font:16px/1.5 system-ui}footer{margin-top:3rem;border-top:1px solid #bbb;font:14px/1.6 system-ui} @media print{body{font-size:11pt;line-height:1.45;padding:0}footer{margin-top:1rem}p{margin:.65em 0}h2{font-size:14pt;margin:1em 0 .5em}a{color:inherit}pre{white-space:pre-wrap}tr,img{break-inside:avoid}h1,h2,h3{break-after:avoid}table{display:table;width:100%;overflow:visible}}</style></head><body><main>'+body+'</main><footer>AulaTeX UCM · Fork creado por la Oficina de Software Libre y Tecnologías Abiertas</footer></body></html>';}
