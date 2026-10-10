import {isMarkdown,imagePath,standaloneMarkdown} from './markdown.mjs';
import {dec,toB64} from './core.mjs';
export function installMarkdown({state,$,notify,download,openFile,currentConfig}){
 let timer=null,worker=null,serial=0,killTimer=null,urls=[],previous=false,pending=null;
 const getText=()=>dec.decode(state.files.get(state.active)?.bytes||new Uint8Array());
 function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function stop(){clearTimeout(timer);clearTimeout(killTimer);if(worker)worker.terminate();worker=null;pending?.reject(Error('Vista sustituida por una nueva edición.'));pending=null;}
 function images(portable){const out=Object.create(null);for(const [path,f] of state.files){if(imagePath(path)===path&&/\.(png|jpe?g|gif|webp)$/i.test(path)&&f.bytes.length<=20*1024*1024){const ext=path.split('.').at(-1).toLowerCase(),mime='image/'+({jpg:'jpeg',jpeg:'jpeg',png:'png',gif:'gif',webp:'webp'}[ext]);if(portable)out[path]='data:'+mime+';base64,'+toB64(f.bytes);else{const url=URL.createObjectURL(new Blob([f.bytes],{type:mime}));urls.push(url);out[path]=url;}}}return out;}
 function parse(text,portable=false){
  if(worker)worker.terminate();clearTimeout(killTimer);pending?.reject(Error('Vista sustituida por una nueva edición.'));pending=null;
  const id=++serial;return new Promise((resolve,reject)=>{
   try{worker=new Worker(new URL('./markdown-worker.mjs',import.meta.url),{type:'module'});}catch{reject(Error('El navegador ha bloqueado el trabajador de Markdown. Prueba la web por HTTP(S), no con doble clic sobre index.html.'));return;}
   pending={reject};worker.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(killTimer);worker?.terminate();worker=null;pending=null;if(data.error)reject(Error(data.error));else resolve(data.result);};
   worker.onerror=()=>{clearTimeout(killTimer);worker?.terminate();worker=null;pending=null;reject(Error('No se pudo iniciar Markdown. Comprueba que app/ y vendor/ se publicaron completos.'));};
   killTimer=setTimeout(()=>{worker?.terminate();worker=null;pending=null;reject(Error('Vista detenida tras 2 segundos de análisis. El archivo sigue disponible para editar y guardar.'));},2000);
   worker.postMessage({id,text,options:{active:state.active,images:images(portable)}});
  });
 }
 function update(){
  const active=isMarkdown(state.active);document.body.classList.toggle('markdown-active',active);$('markdown-panel').hidden=!active;$('markdown-tools').hidden=!active;
  $('open-pdf').hidden=active;$('download-pdf').hidden=active;$('preview-label').textContent=active?'Lectura Markdown':'Vista previa';$('view-pdf').textContent=active?'Lectura':'PDF';$('editor').setAttribute('aria-label',active?'Código fuente Markdown':'Código fuente LaTeX o texto');
  if(!active){if(previous){stop();release();$('preview-notice').textContent=state.pdfURL?'PDF de la última compilación. Guarda y compila para reflejar los cambios.':state.repo?'Guarda y compila el documento principal para generar su PDF.':'PDF de ejemplo precompilado: no refleja las ediciones locales.';$('pdf-status').textContent=state.pdfURL?'PDF':state.repo?'SIN COMPILAR':'EJEMPLO';}previous=false;return;}
  previous=true;clearTimeout(timer);const revision=++serial,content=getText();$('pdf-status').textContent='VISTA LOCAL';$('preview-notice').textContent='Markdown se interpreta en este navegador. No consume Actions y no guarda el archivo por sí solo.';
  timer=setTimeout(async()=>{release();try{const r=await parse(content);if(!isMarkdown(state.active)||revision!==serial-1)return;$('markdown-panel').innerHTML=r.html;$('markdown-hint').textContent='Vista local · '+r.headings.length+' encabezados';}catch(e){if(!e.message.startsWith('Vista sustituida')){$('markdown-panel').textContent=e.message;$('markdown-hint').textContent='Vista detenida; el código está intacto.';}}},220);
 }
 $('markdown-download').onclick=()=>{if(isMarkdown(state.active))download(new Blob([state.files.get(state.active).bytes],{type:'text/markdown;charset=utf-8'}),state.active.split('/').at(-1));};
 $('markdown-export').onclick=async()=>{if(!isMarkdown(state.active))return;clearTimeout(timer);try{const name=state.active,text=getText(),r=await parse(text,true);download(new Blob([standaloneMarkdown(name,r.html)],{type:'text/html;charset=utf-8'}),name.replace(/\.(md|markdown)$/i,'.html'));notify('HTML autónomo exportado. Ábrelo e imprime a PDF desde el navegador. No incluye credenciales.');}catch(e){notify(e.message,'error');}};
 $('markdown-print').onclick=()=>{if(isMarkdown(state.active))window.print();};
 $('markdown-example').onclick=()=>{const p=[...state.files.keys()].find(isMarkdown);if(p)openFile(p);else{notify('Crea un proyecto con la plantilla Markdown o añade un archivo .md.');$('new-project').click();$('new-template').value='markdown';}};
 return {update,stop,renderMain(){const cfg=currentConfig();if(isMarkdown(cfg.main))openFile(cfg.main);else update();}};
}
