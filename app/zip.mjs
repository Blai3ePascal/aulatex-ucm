import {LIMITS,safePath,checkFiles} from './core.mjs';
export async function importZip(buffer){
 if(buffer.byteLength>LIMITS.zip)throw Error('El ZIP comprimido supera 30 MiB.');
 const zip=await globalThis.JSZip.loadAsync(buffer,{checkCRC32:false,createFolders:false});
 const entries=Object.values(zip.files).filter(f=>!f.dir&&!f.name.startsWith('__MACOSX/')&&!/(^|\/)\.DS_Store$/.test(f.name));
 if(entries.length>LIMITS.files)throw Error('Demasiados archivos en el ZIP.');
 let expected=0;
 for(const f of entries){
  const raw=f.unsafeOriginalName||f.name;
  if(raw.startsWith('/')||raw.includes('\\')||raw.split('/').includes('..'))throw Error('ZIP con rutas inseguras.');
  if((f.unixPermissions&0xF000)===0xA000)throw Error('El ZIP contiene enlaces simbólicos.');
  const size=f._data?.uncompressedSize;if(!Number.isSafeInteger(size)||size<0||size>LIMITS.file)throw Error('Tamaño de entrada no permitido.');
  expected+=size;if(expected>LIMITS.project)throw Error('El ZIP descomprimido supera 80 MiB.');
 }
 const common=entries.length&&entries.every(f=>f.name.includes('/')&&f.name.split('/')[0]===entries[0].name.split('/')[0])?entries[0].name.split('/')[0]+'/':'';
 const files=new Map();
 for(const f of entries){const path=safePath(f.name.slice(common.length));if(files.has(path))throw Error('Archivo duplicado: '+path);files.set(path,{bytes:await f.async('uint8array')});}
 checkFiles(files);return files;
}
export async function exportZip(files){checkFiles(files);const zip=new globalThis.JSZip();for(const [path,f] of files)zip.file(path,f.bytes);return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});}
