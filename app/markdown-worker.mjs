import {renderMarkdown} from './markdown.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:renderMarkdown(data.text,data.options)});}catch(e){self.postMessage({id:data.id,error:e.message});}};
