#!/usr/bin/env python3
"""Download the unaltered official UCM logo once; no network dependency at runtime.
Alternatively --file /path/to/official.png imports a logo provided by the institution.
No credentials are used, no HTML/SVG code is accepted, no fonts are downloaded.
"""
import argparse,hashlib,json,time,urllib.request
from datetime import datetime,timezone
from pathlib import Path
SOURCE='https://www.ucm.es/data/cont/docs/377-2023-11-22-Complutense-Logo-lateral-color-png-1.png'
ASSETS=Path(__file__).resolve().parents[1]/'assets'
def store(data:bytes,source:str,assets:Path=ASSETS):
 if not 100<len(data)<=2*1024**2:raise ValueError('Imagen vacía o mayor de 2 MiB.')
 if data.startswith(b'\x89PNG\r\n\x1a\n'):ext='png'
 elif data.startswith(b'\xff\xd8\xff'):ext='jpg'
 else:raise ValueError('La respuesta no es una imagen PNG/JPEG. No se publicará HTML como logo.')
 assets.mkdir(parents=True,exist_ok=True);name='ucm-logo.'+ext;(assets/name).write_bytes(data)
 meta=dict(file=name,source=source,downloaded_at=datetime.now(timezone.utc).isoformat(),sha256=hashlib.sha256(data).hexdigest(),rights='Marca UCM. Excluida de la licencia MIT de AulaTeX.')
 (assets/'brand.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print('Logo oficial preparado:',name);return meta
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--file',type=Path);a=p.parse_args()
 if a.file:store(a.file.read_bytes(),'Archivo institucional suministrado por el administrador')
 else:
  # Accept a locally provided, already validated logo so deployment need not contact UCM.
  manifest=ASSETS/'brand.json'
  if manifest.exists():
   m=json.loads(manifest.read_text());f=ASSETS/m.get('file','')
   if m.get('file') in ('ucm-logo.jpg','ucm-logo.png') and f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest()==m.get('sha256'):
    print('Usando logo institucional ya incluido y verificado.');raise SystemExit(0)
  for attempt in range(3):
   try:
    req=urllib.request.Request(SOURCE,headers={'User-Agent':'AulaTeX-UCM/4.0 (institutional logo asset)'})
    with urllib.request.urlopen(req,timeout=30) as r:data=r.read(2*1024**2+1)
    store(data,SOURCE);break
   except Exception as e:
    if attempt==2:raise SystemExit('No se pudo obtener el logo oficial. Descárgalo de UCM, ejecuta prepare_brand.py --file LOGO.png y vuelve a desplegar. Detalle: '+str(e))
    time.sleep(2*(attempt+1))
