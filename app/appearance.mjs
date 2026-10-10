/* Personalisation is browser-local. Colour strings and numbers are validated, never evaluated. MIT. */
export const PRESETS = Object.freeze({
 'ucm-light':{name:'UCM · claro',background:'#EDEBE9',surface:'#FFFFFF',text:'#1E1E1E',accent:'#B71234'},
 'ucm-dark':{name:'UCM · oscuro',background:'#161512',surface:'#242320',text:'#F1F0ED',accent:'#B71234'},
 'board-light':{name:'Tablero · claro',background:'#EDEBE9',surface:'#F8F7F5',text:'#262421',accent:'#526B32'},
 'board-dark':{name:'Tablero · oscuro',background:'#161512',surface:'#262421',text:'#EBE9E4',accent:'#A5BA74'},
 'sepia':{name:'Papel · sepia',background:'#E6DEC9',surface:'#F7EED8',text:'#342D24',accent:'#795122'},
 'contrast':{name:'Alto contraste',background:'#000000',surface:'#080808',text:'#FFFFFF',accent:'#FFE36A'}
});
export const DEFAULT_APPEARANCE=Object.freeze({schema:1,preset:'ucm-light',...PRESETS['ucm-light'],uiSize:16,editorSize:18,lineHeight:1.6,readingSize:19,serif:true,wrap:false,largeTargets:false,sidebar:248,split:50});
export function validColor(value){if(typeof value!=='string'||!/^#[\da-f]{6}$/i.test(value))throw Error('Color no válido: utiliza # seguido de seis cifras hexadecimales.');return value.toUpperCase();}
function rgb(hex){return validColor(hex).slice(1).match(/../g).map(n=>parseInt(n,16));}
function hex(values){return '#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();}
export function mix(a,b,weight){return hex(rgb(a).map((v,i)=>v*(1-weight)+rgb(b)[i]*weight));}
export function luminance(color){const c=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function legible(candidate,bg,min=4.5){candidate=validColor(candidate);if(contrast(candidate,bg)>=min)return candidate;const dest=contrast('#000000',bg)>=contrast('#FFFFFF',bg)?'#000000':'#FFFFFF';for(let i=1;i<=100;i++){const v=mix(candidate,dest,i/100);if(contrast(v,bg)>=min)return v;}return dest;}
function number(v,fallback,min,max){return Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;}
export function normaliseAppearance(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.schema!==undefined&&input.schema!==1)throw Error('No es una configuración de apariencia de AulaTeX (schema 1).');
 const preset=PRESETS[input.preset]?input.preset:'ucm-light',base={...DEFAULT_APPEARANCE,...PRESETS[preset]};
 const a={schema:1,preset};for(const key of ['background','surface','text','accent'])a[key]=validColor(input[key]??base[key]);
 // A custom text colour that would become unreadable is corrected, and the effective value is shown.
 a.text=legible(a.text,a.surface,4.5);
 for(const [key,min,max] of [['uiSize',14,24],['editorSize',16,40],['readingSize',16,30],['lineHeight',1.35,2],['sidebar',190,350],['split',30,70]])a[key]=number(input[key],base[key],min,max);
 for(const key of ['serif','wrap','largeTargets'])a[key]=typeof input[key]==='boolean'?input[key]:base[key];
 return a;
}
export function themeTokens(input){const a=normaliseAppearance(input),dark=luminance(a.surface)<.2,soft=mix(a.surface,a.text,.045),selected=mix(a.surface,a.accent,.1),muted=legible(mix(a.text,a.surface,.26),soft,4.5),link=legible(a.accent,a.surface),on=contrast('#FFFFFF',a.accent)>=contrast('#000000',a.accent)?'#FFFFFF':'#000000';
 return {paper:a.surface,ground:a.background,'ground-ink':legible(a.text,a.background),'ground-muted':legible(mix(a.text,a.background,.25),a.background),'selected-link':legible(a.accent,selected),ink:legible(a.text,soft),soft,muted,line:mix(a.surface,a.text,.2),'control-line':legible(mix(a.surface,a.text,.45),a.surface,3),wine:a.accent,'wine-dark':a.accent,'on-accent':on,link:legible(link,soft),selected,'selected-ink':legible(a.text,selected),code:a.text,command:legible(dark?'#DDAC86':'#8C3829',a.surface),comment:legible(dark?'#9FBDA1':'#466549',a.surface),punct:legible(dark?'#B3B8C4':'#535E72',a.surface),focus:legible(a.accent,a.surface,3),danger:legible(dark?'#FFB6B6':'#A31228',a.surface),'ui-size':a.uiSize+'px','editor-size':a.editorSize+'px','reading-size':a.readingSize+'px','editor-leading':String(a.lineHeight),'reading-font':a.serif?'Georgia, "Times New Roman", serif':'system-ui, "Segoe UI", sans-serif','sidebar-width':a.sidebar+'px','code-share':a.split+'%','control-height':a.largeTargets?'44px':'36px','color-scheme':dark?'dark':'light'};
}
export function installAppearance({$,renderText,notify,download}){
 const KEY='aulatex-appearance-v5';let current=normaliseAppearance(),draft=null;
 try{const s=localStorage.getItem(KEY);if(s&&s.length<5000)current=normaliseAppearance(JSON.parse(s));}catch{}
 function apply(a,store=false){current=normaliseAppearance(a);const tokens=themeTokens(current);for(const [k,v] of Object.entries(tokens))document.documentElement.style.setProperty('--'+k,v);document.documentElement.style.colorScheme=tokens['color-scheme'];document.body.dataset.theme=current.preset;document.body.dataset.largeTargets=String(current.largeTargets);document.body.classList.remove('high-contrast');document.body.classList.toggle('wrap-editor',current.wrap);$('editor').wrap=current.wrap?'soft':'off';if(![...$('font-size').options].some(o=>o.value===String(current.editorSize))){const option=document.createElement('option');option.value=String(current.editorSize);option.textContent=String(current.editorSize);$('font-size').append(option);}$('font-size').value=String(current.editorSize);$('split-size').value=String(current.split);$('outline').setAttribute('aria-label','Estructura del documento');if(store){try{localStorage.setItem(KEY,JSON.stringify(current));}catch{notify('Apariencia aplicada; el navegador no permite recordar ajustes.','error');}}renderText();}
 function fill(a){$('appearance-preset').value=a.preset;for(const k of ['background','surface','text','accent','uiSize','editorSize','readingSize','lineHeight','sidebar','split'])$('appearance-'+k).value=a[k];for(const k of ['serif','wrap','largeTargets'])$('appearance-'+k).checked=a[k];updateReport(a);}
 function read(){const a={schema:1,preset:$('appearance-preset').value};for(const k of ['background','surface','text','accent','uiSize','editorSize','readingSize','lineHeight','sidebar','split'])a[k]=$('appearance-'+k).value;for(const k of ['serif','wrap','largeTargets'])a[k]=$('appearance-'+k).checked;return normaliseAppearance(a);}
 function updateReport(a){$('appearance-contrast').textContent='Texto / panel: '+contrast(a.text,a.surface).toFixed(2)+':1. Texto efectivo: '+a.text+'. El color de los enlaces y de las etiquetas se ajusta para mantener la legibilidad. El logo UCM no se recolorea.';}
 const select=$('appearance-preset');for(const [id,p] of Object.entries(PRESETS)){const opt=document.createElement('option');opt.value=id;opt.textContent=p.name;select.append(opt);}
 $('theme').onclick=()=>{draft={...current};fill(current);$('appearance-dialog').showModal();};
 select.onchange=()=>{const a={...read(),...PRESETS[select.value],preset:select.value};fill(a);apply(a);};
 for(const id of ['background','surface','text','accent','uiSize','editorSize','readingSize','lineHeight','sidebar','split','serif','wrap','largeTargets'])$('appearance-'+id).addEventListener('change',()=>{try{const a=read();apply(a);fill(a);}catch(e){notify(e.message,'error');}});
 $('appearance-save').onclick=()=>{apply(read(),true);draft=null;$('appearance-dialog').close();notify('Apariencia guardada solo en este navegador. No cambia el documento ni el logo.');};
 $('appearance-reset').onclick=()=>{fill(DEFAULT_APPEARANCE);apply(DEFAULT_APPEARANCE);};
 $('appearance-dialog').addEventListener('close',()=>{if(draft){apply(draft);draft=null;}});
 $('appearance-export').onclick=()=>download(new Blob([JSON.stringify(read(),null,2)],{type:'application/json'}),'aulatex-apariencia.json');
 $('appearance-import').onchange=async()=>{const input=$('appearance-import');try{const file=input.files[0];if(!file)return;if(file.size>5000)throw Error('La configuración debe ocupar menos de 5 KB.');const a=normaliseAppearance(JSON.parse(await file.text()));fill(a);apply(a);}catch(e){notify(e.message,'error');}finally{input.value='';}};
 $('font-size').onchange=()=>apply({...current,editorSize:Number($('font-size').value)},true);
 // A keyboard-operable layout control; avoids mouse-only resizers.
 $('split-size').oninput=()=>apply({...current,split:Number($('split-size').value)},true);
 apply(current);
 return {get:()=>({...current}),set:(a)=>apply(a,true)};
}
