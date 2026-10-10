import {installAppearance} from './appearance.mjs';
import {installMarkdown} from './markdown-ui.mjs';
import {isMarkdown,markdownHighlight,markdownOutline} from './markdown.mjs';
import {prepareForce,commitForce} from './force-save.mjs';
let markdownTools,appearanceTools,forcePending=null;
import {installWorkspaceTools} from './workspace-tools.mjs';
let workspaceTools;
import {synchronize,MergeRequired,role,shareLink,parseShare} from './collaboration.mjs';
import {mergeProject,guessEngine} from './merge.mjs';
import {LIMITS,dec,textBytes,safePath,safeRepo,safeBranch,validSlug,config,isText,checkFiles,highlight,outline,guessMain,discover,resultMatches,same} from './core.mjs';
import {GitHub} from './github.mjs';
import {TEMPLATES,templateFiles} from './templates.mjs';
import {importZip,exportZip} from './zip.mjs';
import {draftGet,draftPut,draftRemove,draftsClear} from './drafts.mjs';
const $=id=>document.getElementById(id);
const shared=parseShare(location.hash);
let nextSync=Date.now()+30000,lastAutoSave=0,conflicts=[],viewOnly=shared?.view||false;
function canWrite(){return !state.repo||role(state.repoInfo,viewOnly).write;}
function writeGuard(){if(!canWrite())throw Error('Esta sesión es de solo lectura. GitHub es quien concede los permisos.');if(conflicts.length)throw Error('Resuelve primero los conflictos pendientes.');}

const clone=files=>new Map([...files].map(([p,f])=>[p,{...f,bytes:f.bytes.slice()}]));
const state={api:null,user:null,repo:'',branch:'',repoInfo:null,snapshot:null,slug:'bienvenida',files:templateFiles('articulo','Bienvenida a AulaTeX UCM'),original:new Map(),active:'main.tex',dirty:false,busy:false,pdfURL:'',build:null,wait:null,projectList:[],draftTimer:null,escapeTab:false,previewGeneration:0,editable:true};
state.files.set('cuaderno.md',{bytes:textBytes("# Cuaderno de investigación\n\nUniversidad Complutense de Madrid · Notas de trabajo\n\n> Un documento breve para pensar, revisar y compartir. La vista se actualiza en tu navegador; no utiliza Actions.\n\n## Pregunta de investigación\n\n¿Qué queremos comprobar y con qué evidencia? Escribe aquí el objetivo, el contexto y las limitaciones del estudio.\n\n## Plan de trabajo\n\n- [x] Formular la pregunta.\n- [ ] Reunir las fuentes.\n- [ ] Revisar el método con el equipo.\n\n## Registro de evidencia\n\n| Elemento | Estado | Observación |\n| :--- | :--- | :--- |\n| Protocolo | Borrador | Revisar antes de comenzar |\n| Datos | Pendientes | Registrar su procedencia |\n| Análisis | Pendiente | Separar resultados e interpretación |\n\n## Notas de método\n\nPuedes usar **negrita**, *cursiva*, ~~tachado~~ y `código`.\n\n```python\ndef media(valores):\n    return sum(valores) / len(valores)\n```\n\n## Referencias y próximos pasos\n\nLos enlaces se abren solo al pulsar: [Universidad Complutense de Madrid](https://www.ucm.es/). Las referencias BibTeX siguen disponibles en el gestor; las citas Pandoc y las ecuaciones no se resuelven en esta vista.\n\nGuarda el archivo **.md**, exporta un **HTML autónomo** o imprime a PDF desde tu navegador. El tema cambia la interfaz, no tus fuentes.\n")});
state.original=clone(state.files);
function notify(message,type=''){ $('status').textContent=message;$('status').className='statusbar '+type; }
function localPref(key,value){try{if(value!==undefined)localStorage.setItem('aulatex-pref-'+key,value);return localStorage.getItem('aulatex-pref-'+key);}catch{return null;}}
function busy(value){state.busy=value;document.querySelectorAll('[data-lock]').forEach(el=>el.disabled=value);$('editor').readOnly=value||!state.editable;document.querySelectorAll('.file-button').forEach(el=>el.disabled=value);buttons();}
function buttons(){
 const linked=!!(state.api&&state.repo&&state.snapshot),readonly=!canWrite(),blocked=readonly||conflicts.length>0;
 $('local-drafts').disabled=state.busy||!linked;
 $('force-save').disabled=state.busy||readonly;
 $('save').textContent=linked?'Guardar en GitHub':'Guardar ZIP';
 for(const id of ['save','compile','reload','history'])$(id).disabled=state.busy||!linked;
 for(const id of ['save','compile'])$(id).disabled=state.busy||!linked||blocked;
 for(const id of ['add-file','upload-files','rename-file','delete-file','main-file','engine','insert-section','replace-one','replace-all','new-project','import-project','create-project','do-import'])$(id).disabled=state.busy||blocked;
 $('save').disabled=state.busy||blocked;
 const mdProject=(()=>{try{return currentConfig().engine==='markdown';}catch{return false;}})();
 $('compile').textContent=mdProject?'Actualizar vista':'Compilar';
 if(mdProject)$('compile').disabled=state.busy;
 $('engine').querySelectorAll('option').forEach(o=>o.disabled=mdProject?o.value!=='markdown':o.value==='markdown');
 $('project-select').disabled=state.busy||!linked||conflicts.length>0;
 if(state.active==='project.json'){$('rename-file').disabled=true;$('delete-file').disabled=true;}
 $('insert-section').disabled=state.busy||!state.editable||blocked;
 $('find-toggle').disabled=state.busy||!state.editable;
 $('editor').readOnly=state.busy||!state.editable||blocked;
 $('share').disabled=state.busy||!linked;
 $('bibliography').disabled=state.busy; $('chat-toggle').disabled=!linked; if(workspaceTools)workspaceTools.refresh();
 $('reviews').disabled=state.busy||!linked;
 $('sync-now').disabled=state.busy||!linked||conflicts.length>0;
 $('auto-sync').disabled=readonly||!linked||conflicts.length>0;
 $('resolve-conflicts').hidden=!conflicts.length;
 $('resolve-conflicts').textContent='Resolver conflictos ('+conflicts.length+')';
 $('access-mode').textContent=!linked?'Ejemplo local':readonly?'LECTURA':'EDICIÓN';
}

async function task(fn){if(state.busy)return;busy(true);try{return await fn();}catch(error){if($('force-dialog').open)$('force-status').textContent=error.message||String(error);notify(error.message||String(error),'error');}finally{busy(false);}}
function currentConfig(){return config(JSON.parse(dec.decode(state.files.get('project.json')?.bytes||new Uint8Array())),[...state.files.keys()]);}
function draftKey(){return (state.repo||'local')+'@'+(state.branch||'demo')+'/'+state.slug;}
function isDirty(){return state.files.size!==state.original.size||[...state.files].some(([p,f])=>!state.original.has(p)||!same(f.bytes,state.original.get(p).bytes));}
function markDirty(){state.dirty=isDirty();$('save-state').textContent=state.dirty?(state.repo?'Cambios sin guardar en GitHub.':'Cambios locales: descarga un ZIP antes de cerrar.'):state.repo?'Guardado · revisión '+state.snapshot.sha.slice(0,8):'Ejemplo: los cambios solo están en esta pestaña.';$('file-modified').textContent=state.dirty?'●':'';
 if(state.dirty&&state.pdfURL){$('preview-notice').textContent='Este PDF no incluye tus cambios sin guardar. Guarda y compila para actualizarlo.';$('preview-notice').className='preview-notice';}
 clearTimeout(state.draftTimer);
 if($('local-drafts').checked&&state.dirty)state.draftTimer=setTimeout(()=>saveDraft().catch(e=>notify('No se pudo guardar el borrador local: '+e.message,'error')),800);
}
async function saveDraft(){if(!state.repo||!$('local-drafts').checked)return;await draftPut(draftKey(),{schema:1,baseSha:state.snapshot?.sha||null,treeSha:state.snapshot?.treeSha||null,files:[...state.files].map(([p,f])=>[p,f.bytes]),active:state.active,original:[...state.original].map(([p,f])=>[p,f.bytes]),updated:Date.now()});}
function guard(){return !state.dirty||confirm('Hay cambios sin guardar. Exporta un ZIP antes de continuar para conservarlos. ¿Continuar y sustituir lo que ves en el editor?');}
function stopWaiting(){if(state.wait)state.wait.abort();state.wait=null;$('stop-wait').hidden=true;}
function resetPDF(showDemo=false){state.previewGeneration++;stopWaiting();if(state.pdfURL.startsWith('blob:'))URL.revokeObjectURL(state.pdfURL);state.pdfURL='';state.build=null;$('pdf-frame').removeAttribute('src');$('pdf-frame').hidden=true;$('demo-preview').hidden=!showDemo;$('pdf-empty').hidden=showDemo;$('download-pdf').disabled=true;$('open-pdf').disabled=true;$('pdf-status').textContent=showDemo?'EJEMPLO':'SIN COMPILAR';$('preview-notice').className='preview-notice';$('preview-notice').textContent=showDemo?'PDF de ejemplo precompilado. Conecta tu repositorio para generar el tuyo.':'Guarda y compila este proyecto para ver el resultado.';$('log-text').textContent='No se ha solicitado ninguna compilación.';$('run-link').hidden=true;$('logs').open=false;}
function renderProjectSelect(){const sel=$('project-select');sel.replaceChildren();const all=new Set(state.projectList.map(p=>p.slug));all.add(state.slug);for(const slug of [...all].sort()){const opt=document.createElement('option');opt.value=slug;opt.textContent=slug;sel.append(opt);}sel.value=state.slug;}
function renderFiles(){const list=$('file-list'),filter=$('file-filter').value.toLowerCase();list.replaceChildren();$('file-count').textContent=state.files.size;for(const p of [...state.files.keys()].sort()){if(!p.toLowerCase().includes(filter))continue;const b=document.createElement('button');b.className='file-button'+(p===state.active?' active':'');b.title=p;b.setAttribute('aria-current',p===state.active?'true':'false');const tag=document.createElement('span');tag.className='file-tag';tag.textContent=p.split('.').at(-1).toUpperCase().slice(0,4);const name=document.createElement('span');name.className='name';name.textContent=p;b.append(tag,name);b.disabled=state.busy;b.onclick=()=>openFile(p);list.append(b);}}
function renderMetadata(){const opts=$('main-file');opts.replaceChildren();for(const name of [...state.files.keys()].filter(p=>/\.(tex|md|markdown)$/i.test(p)).sort()){const option=document.createElement('option');option.value=name;option.textContent=name;opts.append(option);}try{const cfg=currentConfig();$('project-title').textContent=cfg.title;opts.value=cfg.main;$('engine').value=cfg.engine;}catch{$('project-title').textContent=state.slug+' · revisa project.json';}renderProjectSelect();buttons();}
function renderText(){const text=$('editor').value;$('gutter').textContent=Array.from({length:text.split('\n').length},(_,i)=>i+1).join('\n');$('highlight').innerHTML=(isMarkdown(state.active)?markdownHighlight:highlight)(text.length<300000?text:'');$('editor-shell').classList.toggle('plain',$('plain-editor').checked||document.body.classList.contains('wrap-editor')||text.length>=300000);const nav=$('outline');nav.replaceChildren();for(const item of (isMarkdown(state.active)?markdownOutline(text):outline(text))){const b=document.createElement('button');b.textContent=item.title;b.title=item.kind;b.style.paddingLeft=item.kind==='subsection'?'12px':'3px';b.onclick=()=>goTo(item.offset);nav.append(b);}if(!nav.children.length){const p=document.createElement('p');p.className='tiny';p.textContent='Las secciones del archivo abierto aparecerán aquí.';nav.append(p);}cursor();syncScroll();if(markdownTools)markdownTools.update();}
function cursor(){const e=$('editor'),before=e.value.slice(0,e.selectionStart);$('cursor').textContent='Línea '+before.split('\n').length+' · columna '+(before.length-before.lastIndexOf('\n'));$('word-count').textContent=(e.value.match(/\S+/g)||[]).length+' palabras aprox.';}
function syncScroll(){$('highlight').scrollTop=$('editor').scrollTop;$('highlight').scrollLeft=$('editor').scrollLeft;$('gutter').scrollTop=$('editor').scrollTop;}
function goTo(offset){const e=$('editor');e.focus();e.setSelectionRange(offset,offset);const line=e.value.slice(0,offset).split('\n').length;e.scrollTop=Math.max(0,(line-3)*parseFloat(getComputedStyle(e).lineHeight));syncScroll();cursor();}
function openFile(path){if(!state.files.has(path))return;state.editable=false;state.active=path;$('filename').textContent=path;const editable=isText(path)&&state.files.get(path).bytes.length<=LIMITS.text;$('editor-shell').hidden=!editable;$('binary-panel').hidden=editable;if(editable){try{$('editor').value=dec.decode(state.files.get(path).bytes);state.editable=true;$('editor').readOnly=state.busy;$('editor').scrollTop=0;renderText();}catch(error){$('editor-shell').hidden=true;$('binary-panel').hidden=false;$('binary-info').textContent='Este archivo no es UTF-8. Convierte su codificación fuera del editor o descárgalo.';}}else{$('binary-info').textContent=path+' · '+(state.files.get(path).bytes.length/1024).toFixed(1)+' KiB. Archivo binario o demasiado grande para editar en pantalla; se conserva íntegro.';}renderFiles();buttons();if(markdownTools)markdownTools.update();}
function replaceSelection(text){if(!state.editable||state.busy||!canWrite()||conflicts.length)return;const e=$('editor');e.focus();e.setRangeText(text,e.selectionStart,e.selectionEnd,'end');e.dispatchEvent(new Event('input',{bubbles:true}));cursor();}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
async function exportCurrent(){download(await exportZip(state.files),state.slug+'.zip');notify('ZIP exportado. Incluye tus archivos actuales, no credenciales.');}
async function loadCurrent(slug){resetPDF();const files=await state.api.loadProject(state.repo,state.snapshot,slug);config(JSON.parse(dec.decode(files.get('project.json')?.bytes||new Uint8Array())),[...files.keys()]);state.slug=slug;state.files=files;state.original=clone(files);state.dirty=false;renderMetadata();openFile(currentConfig().main);markDirty();if($('local-drafts').checked){const draft=await draftGet(draftKey());if(draft?.schema===1&&confirm('Existe un borrador local de '+slug+'. ¿Recuperarlo?')){const restored=new Map(draft.files.map(([p,bytes])=>[p,{bytes:new Uint8Array(bytes)}]));checkFiles(restored);state.files=restored;if(draft.original)state.original=new Map(draft.original.map(([p,bytes])=>[p,{bytes:new Uint8Array(bytes)}]));else if(draft.baseSha&&draft.baseSha!==state.snapshot.sha)state.original=await state.api.loadProject(state.repo,await state.api.snapshotAt(state.repo,draft.baseSha),slug);if(draft.baseSha&&draft.baseSha!==state.snapshot.sha){state.snapshot={...state.snapshot,sha:draft.baseSha,treeSha:draft.treeSha};notify('Borrador recuperado sobre una revisión anterior. Sincronizar combinará tus cambios con GitHub.','error');}renderMetadata();openFile(state.files.has(draft.active)?draft.active:currentConfig().main);markDirty();}}
 // Read an existing result, but label it stale unless its source matches.
 try{const result=await state.api.result(state.repo,slug);if(result)await showResult(result);}catch(e){notify('Proyecto abierto. No se pudo leer el resultado anterior: '+e.message,'error');}
}
async function addLogo(files){try{const logo=await fetch('assets/ucm-logo.png');if(logo.ok)files.set('ucm-logo.png',{bytes:new Uint8Array(await logo.arrayBuffer())});}catch{}try{const manifest=await fetch('assets/brand.json').then(r=>r.ok?r.json():null);if(!['ucm-logo.jpg','ucm-logo.png'].includes(manifest?.file))return;const r=await fetch('assets/'+manifest.file,{cache:'no-store'});if(r.ok&&r.headers.get('content-type')?.startsWith('image/'))files.set(manifest.file,{bytes:new Uint8Array(await r.arrayBuffer())});}catch{/* Logo is decorative; never block document creation. */}}
async function newLocal(slug,title,files){validSlug(slug);checkFiles(files);if(state.projectList.some(p=>p.slug===slug))throw Error('Ya existe un proyecto con ese identificador. No se ha sustituido.');resetPDF();state.slug=slug;state.files=files;state.original=new Map();renderMetadata();openFile(currentConfig().main);markDirty();notify(state.repo?'Proyecto creado en memoria. Pulsa Guardar en GitHub.':'Proyecto local creado. Conecta GitHub o exporta el ZIP.');}
async function applySync(write=false){
 if(!state.api||!state.repo)throw Error('Conecta primero tu repositorio de documentos.');
 if(write)writeGuard();if(conflicts.length)throw Error('Hay conflictos pendientes.');
 if(write){currentConfig();checkFiles(state.files);}
 const active=state.active,pos=$('editor').selectionStart,scroll=$('editor').scrollTop;
 try{
   const result=await synchronize(state.api,{repo:state.repo,branch:state.branch,slug:state.slug,snapshot:state.snapshot,original:state.original,files:state.files,write,message:'AulaTeX: '+state.slug+' · '+(write?'guardar y combinar':'sincronizar')});
   state.snapshot=result.snapshot;state.files=result.files;state.original=result.original;
   state.projectList=discover(state.snapshot.tree);renderMetadata();
   const selected=state.files.has(active)?active:state.files.has('main.tex')?'main.tex':[...state.files.keys()][0];
   if(selected)openFile(selected);
   $('editor').setSelectionRange(pos,pos);$('editor').scrollTop=scroll;syncScroll();markDirty();
   if(state.build&&state.build.source_sha!==state.snapshot.sha){$('pdf-status').textContent='ANTERIOR';$('preview-notice').textContent='El repositorio tiene una revisión posterior al PDF. Compila para actualizarlo.';}
   $('sync-status').textContent='Última sincronización: '+new Date().toLocaleTimeString('es-ES')+' · '+state.snapshot.sha.slice(0,8);
   return true;
 }catch(e){if(e instanceof MergeRequired){
   state.snapshot=e.snapshot;state.original=clone(e.remote);state.files=e.result.files;conflicts=e.result.conflicts;
   renderMetadata();if(state.files.has(active))openFile(active);markDirty();openConflicts();
   $('sync-status').textContent='Sincronización pausada: hay cambios que requieren revisión.';
 }throw e;}
}
async function saveCurrent(){
 writeGuard();
 if(state.repoInfo?.private===false&&!confirm('Este repositorio es PÚBLICO: el texto y los PDF podrán ser leídos por cualquiera. ¿Guardar de todos modos?'))return false;
 notify('Combinando cambios y guardando una versión en GitHub…','working');
 await applySync(true);lastAutoSave=Date.now();
 clearTimeout(state.draftTimer);if($('local-drafts').checked)await draftRemove(draftKey());
 notify('Guardado y sincronizado · '+state.snapshot.sha.slice(0,8)+'.');return true;
}

async function showResult(result){
 if(result.project!==state.slug)throw Error('Resultado de otro proyecto rechazado.');
 const generation=state.previewGeneration,api=state.api,repo=state.repo,slug=state.slug;
 const valid=()=>state.previewGeneration===generation&&state.api===api&&state.repo===repo&&state.slug===slug;
 let log='';if(result.build_log_blob){const bytes=await api.blob(repo,result.build_log_blob);log=new TextDecoder().decode(bytes);}
 if(!valid())return;state.build=result;$('log-text').textContent=log;
 let fresh=result.source_sha===state.snapshot.sha&&!state.dirty;
 if(result.status!=='success'||!result.document_pdf_blob){$('pdf-status').textContent='ERROR';$('preview-notice').textContent=result.error||'LaTeX no ha podido generar el PDF.';$('preview-notice').className='preview-notice error';$('log-indicator').textContent='· error';$('logs').open=true;$('demo-preview').hidden=true;$('pdf-frame').hidden=true;$('pdf-empty').hidden=false;$('open-pdf').disabled=true;$('download-pdf').disabled=true;return;}
 const bytes=await api.blob(repo,result.document_pdf_blob);if(!valid())return;
 if(bytes.length>25*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('El resultado no es un PDF permitido.');
 if(result.pdf_sha256){const digest=await crypto.subtle.digest('SHA-256',bytes),hex=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hex!==result.pdf_sha256)throw Error('El PDF no coincide con la huella de la compilación.');}
 if(!valid())return;fresh=result.source_sha===state.snapshot.sha&&!state.dirty;
 if(state.pdfURL.startsWith('blob:'))URL.revokeObjectURL(state.pdfURL);state.pdfURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));$('pdf-frame').src=state.pdfURL;$('pdf-frame').hidden=false;$('pdf-empty').hidden=true;$('demo-preview').hidden=true;$('open-pdf').disabled=false;$('download-pdf').disabled=false;$('pdf-status').textContent=fresh?'ACTUALIZADO':'ANTERIOR';$('preview-notice').className='preview-notice'+(fresh?' ok':'');$('preview-notice').textContent=(fresh?'PDF actualizado':'PDF anterior; guarda y compila los cambios')+' · '+result.engine+' · revisión '+result.source_sha.slice(0,8)+'.';$('log-indicator').textContent='· compilación correcta';
}
function pause(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);function abort(){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}signal.addEventListener('abort',abort,{once:true});});}
async function waitBuild(context){
 const controller=new AbortController();state.wait=controller;$('stop-wait').hidden=false;const started=Date.now();let round=0;
 try{while(Date.now()-started<18*60*1000){if(round>0)await pause(Math.max(30,state.api.pollSeconds)*1000,controller.signal);if(state.repo!==context.repo||state.slug!==context.slug)return;const result=await state.api.result(context.repo,context.slug);if(controller.signal.aborted||state.repo!==context.repo||state.slug!==context.slug)return;if(resultMatches(result,context)){await showResult(result);if(controller.signal.aborted||state.repo!==context.repo||state.slug!==context.slug)return;notify(result.status==='success'?'Compilación terminada. El PDF corresponde a la revisión guardada '+context.sha.slice(0,8)+'.':'LaTeX ha encontrado un error. Abre Diagnóstico. ',result.status==='success'?'':'error');return;}
 if(round++%2===0){const runs=await state.api.runs(context.repo);if(controller.signal.aborted||state.repo!==context.repo||state.slug!==context.slug)return;const run=runs.find(r=>r.display_title?.startsWith('AulaTeX '+context.id+' '));if(run){$('run-link').href='https://github.com/'+context.repo+'/actions/runs/'+run.id;$('run-link').hidden=false;if(run.status==='completed'&&run.conclusion!=='success'){throw Error('Actions ha terminado con estado '+run.conclusion+'. Revisa su ejecución; no hay un resultado válido de esta solicitud.');}notify(run.status==='queued'?'En cola de GitHub Actions…':'Compilando en GitHub Actions…','working');}}
 }throw Error('Se ha agotado el tiempo de espera de la web. Revisa Actions: no significa necesariamente que el trabajo haya terminado.');}
 catch(error){if(error.name!=='AbortError')notify(error.message,'error');}
 finally{if(state.wait===controller){state.wait=null;$('stop-wait').hidden=true;}}
}
// ---- Remote writes require an explicit user action or opt-in autosave. ----
$('editor').addEventListener('input',()=>{if(!canWrite()||conflicts.length)return;state.files.set(state.active,{bytes:textBytes($('editor').value)});renderText();markDirty();if(state.active==='project.json')renderMetadata();});
$('editor').addEventListener('scroll',syncScroll);$('editor').addEventListener('click',cursor);$('editor').addEventListener('keyup',cursor);
$('editor').addEventListener('keydown',e=>{if(e.key==='Escape'){state.escapeTab=true;return;}if(e.key==='Tab'&&!state.busy){if(state.escapeTab){state.escapeTab=false;return;}e.preventDefault();if(!e.shiftKey)replaceSelection('  ');else{const t=$('editor'),a=t.selectionStart;if(a>=2&&t.value.slice(a-2,a)==='  '){t.setSelectionRange(a-2,a);replaceSelection('');}}}else state.escapeTab=false;});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||document.querySelector('dialog[open]')||e.target.closest?.('#chat-drawer'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$(e.shiftKey?'force-save':'save').click();}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.activeElement===$('editor')){e.preventDefault();$('compile').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&document.activeElement===$('editor')){e.preventDefault();$('find-toggle').click();}});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
$('file-filter').oninput=renderFiles;
$('font-size').onchange=()=>{document.documentElement.style.setProperty('--editor-size',$('font-size').value+'px');localPref('font',$('font-size').value);syncScroll();};
$('plain-editor').onchange=renderText;
$('theme').onclick=()=>{document.body.classList.toggle('high-contrast');localPref('contrast',document.body.classList.contains('high-contrast')?'yes':'no');};
for(const view of ['both','code','pdf'])$('view-'+view).onclick=()=>{$('layout').classList.remove('view-code','view-pdf');if(view!=='both')$('layout').classList.add('view-'+view);for(const v of ['both','code','pdf'])$('view-'+v).setAttribute('aria-pressed',String(v===view));};
$('find-toggle').onclick=()=>{$('findbar').hidden=!$('findbar').hidden;$('find-toggle').setAttribute('aria-expanded',String(!$('findbar').hidden));if(!$('findbar').hidden)$('find-text').focus();};$('close-find').onclick=()=>{$('findbar').hidden=true;$('find-toggle').setAttribute('aria-expanded','false');$('editor').focus();};
function findNext(){const query=$('find-text').value;if(!query)return;const text=$('editor').value,start=$('editor').selectionEnd;let index=text.indexOf(query,start);if(index<0)index=text.indexOf(query);if(index<0){notify('No se ha encontrado el texto.');return;}goTo(index);$('editor').setSelectionRange(index,index+query.length);}
$('find-next').onclick=findNext;$('find-text').onkeydown=e=>{if(e.key==='Enter')findNext();};$('replace-one').onclick=()=>{if(state.busy)return;const e=$('editor');if(e.value.slice(e.selectionStart,e.selectionEnd)!==$ ('find-text').value)findNext();if(e.value.slice(e.selectionStart,e.selectionEnd)===$('find-text').value&&$('find-text').value)replaceSelection($('replace-text').value);};$('replace-all').onclick=()=>{if(state.busy)return;const query=$('find-text').value;if(!query)return;const count=$('editor').value.split(query).length-1;if(!count)return;if(confirm('¿Sustituir '+count+' coincidencias en este archivo?')){$('editor').value=$('editor').value.split(query).join($('replace-text').value);$('editor').dispatchEvent(new Event('input'));notify(count+' sustituciones realizadas.');}};
$('insert-section').onclick=()=>replaceSelection(isMarkdown(state.active)?'\n## Nueva sección\n\nEscribe aquí.\n':'\n\\section{Nueva sección}\nEscribe aquí.\n');
$('main-file').onchange=()=>task(async()=>{const cfg=currentConfig();cfg.main=$('main-file').value;cfg.engine=isMarkdown(cfg.main)?'markdown':cfg.engine==='markdown'?'xelatex':cfg.engine;state.files.set('project.json',{bytes:textBytes(JSON.stringify(cfg,null,2)+'\n')});if(state.active==='project.json')openFile('project.json');renderMetadata();markDirty();});
$('engine').onchange=()=>task(async()=>{const cfg=currentConfig();cfg.engine=$('engine').value;state.files.set('project.json',{bytes:textBytes(JSON.stringify(cfg,null,2)+'\n')});if(state.active==='project.json')openFile('project.json');markDirty();});
$('add-file').onclick=()=>task(async()=>{const answer=prompt('Nombre de archivo, por ejemplo capitulos/metodo.tex');if(answer===null)return;const p=safePath(answer.trim());if(state.files.has(p))throw Error('El archivo ya existe.');state.files.set(p,{bytes:textBytes('')});renderMetadata();openFile(p);markDirty();});
$('rename-file').onclick=()=>task(async()=>{const old=state.active;if(old==='project.json')throw Error('project.json es la configuración obligatoria.');const answer=prompt('Nuevo nombre de '+old,old);if(answer===null||answer===old)return;const p=safePath(answer.trim());if(state.files.has(p))throw Error('Ese nombre ya existe.');let cfg=currentConfig();state.files.set(p,state.files.get(old));state.files.delete(old);if(cfg.main===old){cfg.main=p;state.files.set('project.json',{bytes:textBytes(JSON.stringify(cfg,null,2)+'\n')});}renderMetadata();openFile(p);markDirty();notify('Archivo renombrado. Revisa los \\input y \\includegraphics que lo referencien.');});
$('delete-file').onclick=()=>task(async()=>{if(state.active==='project.json'||state.active===currentConfig().main)throw Error('No elimines la configuración ni el principal. Cambia primero el documento principal.');if(!confirm('¿Eliminar '+state.active+' de la próxima versión? Todavía no se ha guardado en GitHub.'))return;state.files.delete(state.active);renderMetadata();openFile(currentConfig().main);markDirty();});
$('upload-files').onclick=()=>$('files-input').click();$('files-input').onchange=()=>task(async()=>{const next=clone(state.files);for(const file of $('files-input').files){const p=safePath(file.name);if(file.size>LIMITS.file)throw Error(p+' supera 20 MiB.');if(p==='project.json')throw Error('Edita project.json desde el editor.');if(next.has(p)&&!confirm('¿Sustituir '+p+'?'))continue;next.set(p,{bytes:new Uint8Array(await file.arrayBuffer())});}checkFiles(next);state.files=next;renderMetadata();openFile(state.active);markDirty();$('files-input').value='';});
$('download-file').onclick=()=>download(new Blob([state.files.get(state.active).bytes]),state.active.split('/').at(-1));
$('new-project').onclick=()=>{if(guard())$('new-dialog').showModal();};$('create-project').onclick=()=>task(async()=>{const id=validSlug($('new-slug').value.trim()),title=$('new-name').value.trim()||id;const files=templateFiles($('new-template').value,title);await addLogo(files);await newLocal(id,title,files);$('new-dialog').close();});
$('import-project').onclick=()=>{if(guard())$('import-dialog').showModal();};$('do-import').onclick=()=>task(async()=>{const file=$('zip-file').files[0];if(!file)throw Error('Selecciona un ZIP.');const id=validSlug($('import-slug').value.trim()),title=$('import-name').value.trim()||id;if(file.size>LIMITS.zip)throw Error('El ZIP supera 30 MiB.');const files=await importZip(await file.arrayBuffer());let cfg;try{cfg=config(JSON.parse(dec.decode(files.get('project.json').bytes)),[...files.keys()]);}catch{cfg={schema:1,title,main:guessMain(files),engine:guessEngine(files)};}cfg.title=title;files.set('project.json',{bytes:textBytes(JSON.stringify(cfg,null,2)+'\n')});await newLocal(id,title,files);$('import-dialog').close();notify('Importado. Revisa Principal y Motor, guarda y compila.');});
$('export-project').onclick=()=>task(exportCurrent);
$('connect').onclick=()=>$('connection-dialog').showModal();
$('auth-button').onclick=()=>task(async()=>{const token=$('token').value;$('token').value='';const api=new GitHub(token);try{const user=await api.user(),repos=await api.repos();if(state.api)state.api.close();state.api=api;state.user=user;$('auth-status').textContent='Token comprobado. Cuenta: '+user.login+'.';const sel=$('repo-select');sel.replaceChildren();let opt=document.createElement('option');opt.value='';opt.textContent='Selecciona tu repositorio de documentos';sel.append(opt);for(const repo of repos){opt=document.createElement('option');opt.value=repo.full_name;opt.textContent=(repo.private?'Privado · ':'Público · ')+repo.full_name;sel.append(opt);}const likely=repos.find(r=>r.name==='aulatex-proyectos');if(likely&&!shared){sel.value=likely.full_name;$('repo-input').value=likely.full_name;}}catch(e){api.close();$('auth-status').textContent=e.message;throw e;}});
$('repo-select').onchange=()=>{if($('repo-select').value)$('repo-input').value=$('repo-select').value;};
$('open-repo').onclick=()=>task(async()=>{if(!state.api)throw Error('Comprueba primero el token.');if(!guard())return;const repo=safeRepo($('repo-input').value.trim()),info=await state.api.repo(repo),branch=safeBranch($('branch-input').value.trim()||info.default_branch);notify('Leyendo archivos desde GitHub…','working');const snap=await state.api.snapshot(repo,branch),marker=snap.tree.find(f=>f.path==='.aulatex.json');if(!marker)throw Error('Este repositorio no tiene .aulatex.json. Sube primero el contenido de repo-proyectos siguiendo la guía.');const schema=JSON.parse(new TextDecoder().decode(await state.api.blob(repo,marker.sha)));if(schema.schema!==1||schema.projectsRoot!=='projects'||schema.resultBranch!=='aulatex-builds'||schema.workflow!=='compilar.yml')throw Error('Configuración de espacio de trabajo no compatible.');nextSync=Date.now()+30000;state.repo=repo;state.repoInfo=info;state.branch=branch;state.snapshot=snap;state.projectList=discover(snap.tree);if(!state.projectList.length)throw Error('No hay proyectos configurados en projects/<nombre>/project.json.');localPref('repo',repo);$('mode').textContent=info.private?'PRIVADO':'PÚBLICO';$('mode').className='badge '+(info.private?'connected':'');$('account').textContent=state.user.login;$('workspace-name').textContent=repo;$('branch-info').textContent='Rama '+branch+' · '+(info.private?'privada':'pública');$('connect').textContent='Cambiar espacio';$('disconnect').hidden=false;await loadCurrent(shared?.repo===repo&&state.projectList.some(p=>p.slug===shared.slug)?shared.slug:state.projectList[0].slug);$('connection-dialog').close();notify('Espacio abierto. '+(info.private?'El contenido permanece en tu repositorio privado.':'Atención: el contenido es público.'));});
$('disconnect').onclick=()=>task(async()=>{if(!guard())return;stopWaiting();state.api?.close();state.api=null;state.user=null;state.repo='';state.branch='';state.repoInfo=null;state.snapshot=null;state.projectList=[];conflicts=[];viewOnly=false;$('auto-sync').checked=false;state.slug='bienvenida';state.files=templateFiles('articulo','Bienvenida a AulaTeX UCM');state.original=clone(state.files);state.dirty=false;resetPDF(true);renderMetadata();openFile('main.tex');markDirty();$('mode').textContent='DEMO LOCAL';$('mode').className='badge';$('account').textContent='Sin conectar a GitHub';$('workspace-name').textContent='Explora el editor con un ejemplo';$('branch-info').textContent='Ejemplo local · no se envía nada';$('connect').textContent='Conectar GitHub';$('disconnect').hidden=true;notify('Sesión cerrada: token eliminado de memoria. Los borradores locales solo se conservan si activaste esa opción.');});
$('reload').onclick=()=>task(async()=>{await applySync(false);notify('Cambios remotos recibidos; tus cambios locales se han conservado.');});
$('project-select').onchange=()=>task(async()=>{const id=$('project-select').value;if(id===state.slug)return;if(!guard()){$('project-select').value=state.slug;return;}state.snapshot=await state.api.snapshot(state.repo,state.branch);state.projectList=discover(state.snapshot.tree);await loadCurrent(id);notify('Proyecto '+id+' abierto.');});
$('save').onclick=()=>task(()=>state.repo?saveCurrent():exportCurrent());
$('compile').onclick=()=>task(async()=>{if(currentConfig().engine==='markdown'){markdownTools.renderMain();notify('Vista Markdown actualizada localmente; no se ha lanzado Actions.');return;}currentConfig();stopWaiting();if(!await saveCurrent())return;const context={repo:state.repo,slug:state.slug,sha:state.snapshot.sha,id:crypto.randomUUID()};notify('Solicitando compilación a GitHub Actions…','working');await state.api.dispatch(state.repo,state.branch,context);$('pdf-status').textContent='EN COLA';$('preview-notice').className='preview-notice';$('preview-notice').textContent='Actions está preparando el compilador. La primera descarga puede tardar varios minutos.';$('log-text').textContent='Solicitud: '+context.id+'\nRevisión: '+context.sha+'\nEl diagnóstico estará disponible al terminar.';$('run-link').href='https://github.com/'+context.repo+'/actions/workflows/compilar.yml';$('run-link').hidden=false;void waitBuild(context);});
$('stop-wait').onclick=()=>{stopWaiting();notify('Espera detenida en esta pestaña. El trabajo sigue en Actions; Recargar GitHub leerá su resultado.');};
$('open-pdf').onclick=()=>{if(state.pdfURL)window.open(state.pdfURL,'_blank','noopener');};$('download-pdf').onclick=()=>{if(!state.pdfURL)return;const a=document.createElement('a');a.href=state.pdfURL;a.download=state.slug+'.pdf';a.click();};
$('history').onclick=()=>task(async()=>{const rows=await state.api.history(state.repo,state.slug),list=$('history-list');list.replaceChildren();for(const row of rows){const a=document.createElement('a');a.href='https://github.com/'+state.repo+'/commit/'+row.sha;a.target='_blank';a.rel='noopener';a.textContent=row.sha.slice(0,8)+' · '+row.commit.message.split('\n')[0]+' · '+new Date(row.commit.author.date).toLocaleString('es-ES');list.append(a);}$('history-dialog').showModal();});
$('local-drafts').onchange=()=>{if($('local-drafts').checked&&!confirm('Los borradores se guardarán sin cifrar en este navegador. No lo actives en un ordenador compartido. ¿Continuar?')){$('local-drafts').checked=false;return;}localPref('drafts',$('local-drafts').checked?'yes':'no');if($('local-drafts').checked)saveDraft().catch(e=>notify(e.message,'error'));else clearTimeout(state.draftTimer);};
$('clear-drafts').onclick=()=>task(async()=>{if(!confirm('¿Borrar todos los borradores locales de AulaTeX en este navegador? No borra nada de GitHub.'))return;clearTimeout(state.draftTimer);await draftsClear();$('local-drafts').checked=false;localPref('drafts','no');notify('Borradores locales borrados. Los archivos abiertos siguen en esta pestaña.');});
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();$('connection-dialog').addEventListener('close',()=>{$('token').value='';});
for(const t of TEMPLATES){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.name;$('new-template').append(opt);}
$('repo-input').value=shared?.repo||localPref('repo')||'';if(shared)$('branch-input').value=shared.branch;if(localPref('contrast')==='yes')document.body.classList.add('high-contrast');const fs=localPref('font');if(['16','18','20','24','28','32'].includes(fs)){$('font-size').value=fs;document.documentElement.style.setProperty('--editor-size',fs+'px');}$('local-drafts').checked=localPref('drafts')==='yes';
// Only same-origin graphics; no call to UCM at runtime.
$('ucm-logo').addEventListener('error',()=>{$('ucm-logo').hidden=true;document.querySelector('.institution').classList.add('logo-unavailable');});
fetch('assets/brand.json').then(r=>r.ok?r.json():null).then(meta=>{if(['ucm-logo.jpg','ucm-logo.png'].includes(meta?.file)){$('ucm-logo').src='assets/'+meta.file;$('ucm-logo').hidden=false;document.querySelector('.institution').classList.remove('logo-unavailable');}}).catch(()=>{});
renderMetadata();openFile('main.tex');markDirty();


// --- GitHub-only collaboration / sharing v3 ---
function displayVersion(version){if(!version)return '[Archivo eliminado]';try{return dec.decode(version.bytes);}catch{return '[Binario: '+version.bytes.length+' bytes]';}}
function conflictSelected(){return conflicts.find(c=>c.path===$('conflict-file').value)||conflicts[0];}
function renderConflict(){
 const c=conflictSelected();if(!c)return;
 $('conflict-reason').textContent=c.reason;
 $('conflict-base').value=displayVersion(c.base);$('conflict-local').value=displayVersion(c.local);$('conflict-remote').value=displayVersion(c.remote);
 $('conflict-output').value=c.local?displayVersion(c.local):'';
 $('conflict-output').disabled=!isText(c.path);$('resolve-manual').disabled=!isText(c.path);
 $('download-local').disabled=!c.local;$('download-remote').disabled=!c.remote;
}
function openConflicts(){
 if(!conflicts.length)return;
 $('conflict-file').replaceChildren();for(const c of conflicts){const o=document.createElement('option');o.value=c.path;o.textContent=c.path;$('conflict-file').append(o);}renderConflict();
 if(!$('conflicts-dialog').open)$('conflicts-dialog').showModal();buttons();
}
function resolveConflict(choice){
 const c=conflictSelected();if(!c)return;
 const selected=choice==='manual'?{bytes:textBytes($('conflict-output').value)}:c[choice];
 if(selected)state.files.set(c.path,{bytes:selected.bytes.slice()});else state.files.delete(c.path);
 conflicts=conflicts.filter(x=>x.path!==c.path);renderMetadata();markDirty();
 if(state.files.has(state.active))openFile(state.active);else if(state.files.size)openFile([...state.files.keys()][0]);
 if(conflicts.length)openConflicts();else{$('conflicts-dialog').close();notify('Conflictos resueltos en memoria. Guarda para publicar la combinación.');}
 buttons();
}
$('resolve-conflicts').onclick=openConflicts;$('conflict-file').onchange=renderConflict;
for(const choice of ['local','remote','manual'])$('resolve-'+choice).onclick=()=>resolveConflict(choice);
for(const choice of ['local','remote'])$('download-'+choice).onclick=()=>{const c=conflictSelected();if(c?.[choice])download(new Blob([c[choice].bytes]),choice+'-'+c.path.split('/').at(-1));};
$('sync-now').onclick=()=>task(async()=>{await applySync(false);notify('Sincronizado sin descartar tu edición.');});
$('auto-sync').onchange=()=>{
 if($('auto-sync').checked&&!confirm('Activar guardado compartido: se enviarán cambios a GitHub como máximo una vez por minuto mientras esta pestaña esté visible. No lanza compilaciones automáticas. ¿Activar?'))$('auto-sync').checked=false;
 lastAutoSave=Date.now();$('sync-status').textContent=$('auto-sync').checked?'Guardado automático activado: hasta una vez por minuto.':'Guardado manual. La recepción de cambios sigue activa cada 30 segundos.';
};
setInterval(()=>{
 if(Date.now()<nextSync||state.busy||!state.api||!state.repo||conflicts.length||document.hidden||!navigator.onLine||document.querySelector('dialog[open]'))return;
 nextSync=Date.now()+Math.max(30,state.api.pollSeconds)*1000;
 // Public documents are never published automatically without a specific confirmation.
 const write=$('auto-sync').checked&&canWrite()&&state.dirty&&Date.now()-lastAutoSave>=60000;
 void task(async()=>{try{if(write)await saveCurrent();else await applySync(false);}catch(e){
   nextSync=Math.max(nextSync,e.retryAt||Date.now()+60000);
   if([401,403,404].includes(e.status)&&!e.retryAt){$('auto-sync').checked=false;nextSync=Infinity;$('sync-status').textContent='Sincronización detenida: revisa la sesión o los permisos y reconecta.';}
   throw e;
 }});
},1000);
function refreshShareLink(){
 $('share-link').value=shareLink(location.href,{repo:state.repo,branch:state.branch,slug:state.slug,view:$('link-mode').value==='view'});
}
$('share').onclick=()=>task(async()=>{
 const rights=role(state.repoInfo,viewOnly);
 $('invite-role').querySelector('option[value="pull"]').disabled=!rights.organization;
 if(!rights.organization)$('invite-role').value='push';
 $('invite-user').disabled=!rights.admin;$('invite-role').disabled=!rights.admin;$('send-invite').disabled=!rights.admin;
 $('share-warning').textContent='El acceso incluye TODO el repositorio '+state.repo+' ('+state.projectList.length+' proyecto(s)), también su historial y resultados. '+(rights.organization?'GitHub permite lectura o edición. Revisa también los permisos base de la organización.':'Los repositorios personales no admiten colaboradores privados de solo lectura. Usa una organización para ese rol.');
 $('github-access').href='https://github.com/'+state.repo+'/settings/access';
 refreshShareLink();$('share-dialog').showModal();
});
$('link-mode').onchange=refreshShareLink;
$('copy-link').onclick=()=>task(async()=>{await navigator.clipboard.writeText($('share-link').value);notify('Enlace copiado. No contiene credenciales y NO concede acceso por sí solo.');});
$('send-invite').onclick=()=>task(async()=>{
 const username=$('invite-user').value.trim(),permission=$('invite-role').value;
 if(!confirm('¿Invitar a '+username+' a TODO '+state.repo+' con permiso '+(permission==='pull'?'LECTURA':'EDICIÓN')+'?'))return;
 const token=$('admin-token').value.trim();$('admin-token').value='';const api=token?new GitHub(token):state.api;
 try{await api.invite(state.repo,username,permission,state.repoInfo);$('invite-status').textContent='GitHub ha aceptado la solicitud. Si es una invitación nueva, el destinatario debe aceptarla; si ya tenía acceso, se ha actualizado el permiso.';}
 finally{if(token)api.close();}
});
$('share-dialog').addEventListener('close',()=>{$('admin-token').value='';});
$('list-collaborators').onclick=()=>task(async()=>{
 const users=await state.api.collaborators(state.repo),list=$('collaborator-list');list.replaceChildren();
 for(const u of users){const row=document.createElement('div');row.textContent=u.login+' · '+(u.role_name|| (u.permissions?.push?'edición':'lectura'));list.append(row);}
});
$('revoke-user').onclick=()=>task(async()=>{
 if(!state.repoInfo?.permissions?.admin)throw Error('Necesitas administrar el repositorio.');
 const username=$('invite-user').value.trim();
 if(!confirm('¿Retirar el acceso DIRECTO de '+username+' a '+state.repo+'? Los permisos de equipos y de la organización pueden seguir concediendo acceso. Las copias ya descargadas no se pueden retirar.'))return;
 const token=$('admin-token').value.trim();$('admin-token').value='';const api=token?new GitHub(token):state.api;
 try{await api.revoke(state.repo,username);$('invite-status').textContent='Acceso directo retirado. Comprueba los permisos heredados en GitHub.';}finally{if(token)api.close();}
});
$('reviews').onclick=()=>task(async()=>{
 $('send-review').disabled=!canWrite();$('review-file').textContent=state.active+' · revisión '+state.snapshot.sha.slice(0,8);
 $('review-status').textContent='Los comentarios son Issues del repositorio. Se publican solo al pulsar Enviar.';$('reviews-dialog').showModal();
});
$('load-reviews').onclick=()=>task(async()=>{
 const result=await state.api.reviews(state.repo,state.slug),list=$('reviews-list');list.replaceChildren();
 for(const item of result.items||[]){const a=document.createElement('a');a.href='https://github.com/'+state.repo+'/issues/'+Number(item.number);a.target='_blank';a.rel='noopener';a.textContent='#'+item.number+' · '+item.title+' · '+item.state;list.append(a);}
 $('review-status').textContent='Mostrando '+(result.items?.length||0)+' de '+result.total_count+' comentarios/tareas; GitHub Search puede tardar en indexar los nuevos.';
});
$('send-review').onclick=()=>task(async()=>{
 writeGuard();const e=$('editor'),quote=e.value.slice(e.selectionStart,e.selectionEnd).slice(0,3000);
 const line=e.value.slice(0,e.selectionStart).split('\n').length;
 const body=$('review-body').value+'\n\n---\nArchivo: `'+state.active+'` · línea orientativa '+line+'\nRevisión: `'+state.snapshot.sha+'`'+(state.dirty?' (hay cambios locales no publicados)':'')+(quote?'\n\nSelección:\n'+quote.split('\n').map(l=>'> '+l).join('\n'):'');
 const result=await state.api.addReview(state.repo,state.slug,{title:$('review-title').value,body});
 $('review-status').textContent='Comentario creado como Issue #'+result.number+'. Las respuestas y el cierre se gestionan en GitHub.';$('review-title').value='';$('review-body').value='';
});
// Restore a historical file/project as a new local edit, never reset/force-push Git.
$('restore-version').onclick=()=>task(async()=>{
 writeGuard();const sha=$('restore-sha').value.trim();if(!guard())return;
 const snapshot=await state.api.snapshotAt(state.repo,sha),files=await state.api.loadProject(state.repo,snapshot,state.slug);
 config(JSON.parse(dec.decode(files.get('project.json')?.bytes||new Uint8Array())),[...files.keys()]);
 if(!confirm('¿Recuperar '+sha.slice(0,8)+' como cambios locales? Después debes guardar. No se borra el historial.'))return;
 state.files=files;renderMetadata();openFile(currentConfig().main);markDirty();$('history-dialog').close();notify('Versión recuperada localmente. Guarda para crear una nueva revisión.');
});
// Following a link only selects a project; it never bypasses GitHub authorization.
$('connection-dialog').addEventListener('close',()=>{nextSync=Date.now()+30000;});
buttons();

workspaceTools=installWorkspaceTools({state,$,canWrite,writeGuard,notify,task,markDirty,renderMetadata,openFile,currentConfig,replaceSelection,download});
buttons();

markdownTools=installMarkdown({state,$,notify,download,openFile,currentConfig});
appearanceTools=installAppearance({$,renderText,notify,download});
$('sidebar-toggle').onclick=()=>{const mobile=matchMedia('(max-width:700px)').matches;if(mobile){const on=document.body.classList.toggle('files-open');$('sidebar-toggle').setAttribute('aria-expanded',String(on));}else{const off=document.body.classList.toggle('files-hidden');$('sidebar-toggle').setAttribute('aria-expanded',String(!off));}};
$('force-save').onclick=()=>task(async()=>{
 if(!canWrite())throw Error('No tienes permiso de escritura.');
 if(!state.repo){await exportCurrent();notify('Guardado inmediato: ZIP descargado con la edición actual. Aún no hay repositorio conectado.');return;}
 currentConfig();checkFiles(state.files);
 const plan=await prepareForce(state.api,{repo:state.repo,branch:state.branch,slug:state.slug,original:state.original,files:state.files});
 for(const c of conflicts)if(!plan.overwrites.some(o=>o.path===c.path))plan.overwrites.push({path:c.path,reason:c.reason,deleted:!c.local});
 forcePending={plan,repo:state.repo,branch:state.branch,slug:state.slug,local:clone(state.files)};
 $('force-status').textContent='';
 $('force-summary').textContent=state.repo+' · '+state.slug+' · revisión '+plan.snapshot.sha.slice(0,8)+' · '+plan.changed.length+' archivo(s) a guardar.'+(state.repoInfo.private===false?' ATENCIÓN: repositorio PÚBLICO.':'');
 $('force-files').replaceChildren();for(const path of plan.changed){const li=document.createElement('li');li.textContent=path+(plan.overwrites.some(o=>o.path===path)?' — prevalecerá mi versión':' — cambios compatibles');$('force-files').append(li);}
 const risk=plan.overwrites.length>0;$('force-warning').hidden=!risk;$('force-warning').textContent='Tu versión sustituirá los cambios incompatibles en: '+plan.overwrites.map(o=>o.path).join(', ')+'. La versión remota seguirá en el historial. Antes de guardar se descargará una copia ZIP de tu edición.';
 for(const id of ['force-confirm-label','force-confirm-text'])$(id).hidden=!risk;$('force-confirm-text').value='';$('force-confirm').disabled=!plan.hasChanges;$('force-confirm').textContent=plan.hasChanges?'Guardar esta revisión ahora':'Ya coincide con GitHub';
 $('force-dialog').showModal();
});
$('force-local-zip').onclick=()=>task(async()=>{if(forcePending)download(await exportZip(forcePending.local),forcePending.slug+'-local.zip');});
$('force-remote-zip').onclick=()=>task(async()=>{if(forcePending)download(await exportZip(forcePending.plan.remote),forcePending.slug+'-github.zip');});
$('force-confirm').onclick=()=>task(async()=>{
 const job=forcePending;if(!job||!canWrite()||job.repo!==state.repo||job.slug!==state.slug)throw Error('Reabre el diálogo: el proyecto o los permisos han cambiado.');
 if(job.plan.overwrites.length&&$('force-confirm-text').value.trim()!=='GUARDAR')throw Error('Escribe GUARDAR para confirmar la sustitución indicada.');
 if(job.plan.overwrites.length)download(await exportZip(job.local),job.slug+'-antes-de-forzar.zip');
 const saved=await commitForce(state.api,{repo:job.repo,branch:job.branch,slug:job.slug,plan:job.plan});
 state.snapshot=saved;state.files=job.plan.files;state.original=clone(state.files);conflicts=[];forcePending=null;clearTimeout(state.draftTimer);
 if($('local-drafts').checked)await draftRemove(draftKey());state.projectList=discover(saved.tree);renderMetadata();openFile(state.files.has(state.active)?state.active:currentConfig().main);markDirty();lastAutoSave=Date.now();
 $('force-dialog').close();if($('conflicts-dialog').open)$('conflicts-dialog').close();notify('Guardado inmediato confirmado · '+saved.sha.slice(0,8)+'. Historial conservado; sin force-push.');
});
$('force-dialog').addEventListener('close',()=>{forcePending=null;$('force-confirm-text').value='';});
$('chat-close').addEventListener('click',()=>$('chat-toggle').focus());
$('chat-drawer').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('chat-close').click();}});
$('sidebar-toggle').setAttribute('aria-expanded',String(!matchMedia('(max-width:700px)').matches));
markdownTools.update();buttons();
