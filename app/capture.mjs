/* Standalone function: also executed in an isolated activeTab extension world. MIT. */
export function capturePage() {
 const warnings=[],clean=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,12000);
 if(!/^https?:$/.test(location.protocol))throw Error('Abre una página web HTTP/HTTPS normal, no el visor PDF ni una página interna.');
 const map=Object.create(null);
 for(const m of document.querySelectorAll('meta[name],meta[property]')){
  const k=(m.getAttribute('name')||m.getAttribute('property')||'').toLowerCase(),v=clean(m.getAttribute('content'));
  if(k&&v){(map[k]??=[]).push(v);}
 }
 const first=(...keys)=>keys.map(k=>map[k]?.[0]).find(Boolean)||'';
 const names=v=>Array.isArray(v)?v:v?[v]:[];
 const author=v=>{if(typeof v==='string')return {literal:clean(v)};return v?.familyName?{family:clean(v.familyName),given:clean(v.givenName)}:{literal:clean(v?.name)};};
 const accessed={'date-parts':[[new Date().getFullYear(),new Date().getMonth()+1,new Date().getDate()]]};
 const absolute=v=>{try{const u=new URL(v,location.href);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return '';u.hash='';return u.href;}catch{return '';}};
 const pageURL=absolute(document.querySelector('link[rel="canonical"]')?.href||location.href);
 const doi=v=>clean(v).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');
 let nodes=[];
 function walk(node,depth=0){if(depth>5||nodes.length>200)return;if(Array.isArray(node)){for(const v of node)walk(v,depth+1);}else if(node&&typeof node==='object'){nodes.push(node);if(node['@graph'])walk(node['@graph'],depth+1);if(node.mainEntity)walk(node.mainEntity,depth+1);if(node.itemListElement)walk(node.itemListElement,depth+1);if(node.item)walk(node.item,depth+1);}}
 for(const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,40)){
  if(script.textContent.length>1000000){warnings.push('Se omitió un bloque JSON-LD demasiado grande.');continue;}try{walk(JSON.parse(script.textContent));}catch{warnings.push('Un bloque JSON-LD de la página no es JSON válido.');}
 }
 const types={'ScholarlyArticle':'article-journal','Article':'article-journal','NewsArticle':'article-newspaper','BlogPosting':'webpage','Book':'book','Chapter':'chapter','Dataset':'dataset','SoftwareSourceCode':'software','SoftwareApplication':'software','Thesis':'thesis','Report':'report'};
 const relevant=nodes.filter(n=>names(n['@type']).some(t=>types[String(t).split('/').at(-1)]));
 const records=[];
 for(const n of relevant.slice(0,100)){
  const tp=names(n['@type']).map(t=>String(t).split('/').at(-1)).find(t=>types[t]);
  let identifier='';for(const id of names(n.identifier)){const v=typeof id==='object'?id.value||id['@id']:id;if(v&&/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:|10\.\d{4,9}\/)/i.test(String(v)))identifier=doi(v);}
  records.push({type:types[tp],title:clean(n.headline||n.name),author:names(n.author||n.creator).map(author).filter(x=>x.literal||x.family),date:clean(n.datePublished),publisher:clean(typeof n.publisher==='string'?n.publisher:n.publisher?.name),'container-title':clean(n.isPartOf?.name),DOI:identifier,URL:absolute(n.url||n['@id'])||pageURL,ISBN:clean(n.isbn),accessed});
 }
 const title=first('citation_title','dc.title','dcterms.title');
 if(title){
  const book=first('citation_book_title','citation_inbook_title'),journal=first('citation_journal_title');
  const r={type:book?'chapter':journal||first('citation_doi')?'article-journal':'webpage',title,author:(map.citation_author||map['dc.creator']||map['dcterms.creator']||first('citation_authors').split(';')).filter(Boolean).map(n=>({literal:clean(n)})),date:first('citation_publication_date','citation_date','citation_online_date','citation_year','dc.date','dcterms.issued'),'container-title':journal||book,publisher:first('citation_publisher','dc.publisher'),volume:first('citation_volume'),issue:first('citation_issue'),page:[first('citation_firstpage'),first('citation_lastpage')].filter(Boolean).join('--'),DOI:doi(first('citation_doi')),ISBN:first('citation_isbn'),ISSN:first('citation_issn'),URL:absolute(first('citation_public_url','citation_abstract_html_url'))||pageURL,accessed};
  // Highwire describes the current work; JSON-LD may additionally describe recommendations.
  const match=records.find(x=>(r.DOI&&x.DOI?.toLowerCase()===r.DOI.toLowerCase())||x.title===r.title);
  if(match){for(const k of Object.keys(r))if(!r[k]||(Array.isArray(r[k])&&!r[k].length))r[k]=match[k];}
  records.unshift(r);
 }
 if(!records.length){
  for(const span of [...document.querySelectorAll('span.Z3988[title]')].slice(0,100)){
   const q=new URLSearchParams(span.title);const t=q.get('rft.atitle')||q.get('rft.btitle')||q.get('rft.title');if(!t)continue;
   const id=q.getAll('rft_id').find(x=>/doi/.test(x));records.push({type:q.get('rft.genre')==='article'?'article-journal':'book',title:t,author:q.getAll('rft.au').map(n=>({literal:n})),date:q.get('rft.date'),'container-title':q.get('rft.jtitle'),volume:q.get('rft.volume'),issue:q.get('rft.issue'),DOI:doi((id||'').replace(/^info:doi\//,'')),ISBN:q.get('rft.isbn'),URL:pageURL,accessed});
  }
 }
 if(!records.length){records.push({type:'webpage',title:first('og:title','twitter:title')||clean(document.title)||'Página sin título',author:first('author')?[{literal:first('author')}]:[],date:first('article:published_time','date'),URL:pageURL,accessed});warnings.push('Ficha web básica: no hay metadatos académicos reconocidos. Revisa autor, fecha y tipo.');}
 const seen=new Set(),items=[];
 for(const r of records){const key=(r.DOI||r.title+'|'+r.URL).toLowerCase();if(seen.has(key))continue;seen.add(key);items.push(r);}
 if(items.length>1)warnings.push('La página contiene varias referencias o recomendaciones: selecciona solo las que necesitas.');
 if(items.some(r=>!r.author?.length))warnings.push('Faltan autores en alguna ficha; no se han inventado.');
 return {schema:1,source:'AulaTeX capturador — metadatos de la página abierta',items,warnings};
}
