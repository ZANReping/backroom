import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../public/textures/documents/',import.meta.url);mkdirSync(root,{recursive:true});
const file='Manila%20Mary%20Foundation%20Logo%20Fixed.png';
let error;
for(const host of ['https://backrooms-wiki.wikidot.com','https://backrooms-wiki.wdfiles.com'])try{
 const url=`${host}/local--files/manila-room/${file}`,r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`${r.status} ${url}`);const b=Buffer.from(await r.arrayBuffer());if(b.subarray(1,4).toString()!=='PNG')throw Error('Not a PNG');
 writeFileSync(new URL('manila-mary-logo.png',root),b);writeFileSync(new URL('manila-mary-logo.json',root),JSON.stringify({url,page:'https://backrooms-wiki-cn.wikidot.com/manila-room',pageAuthors:['Br Miller','Neptunium'],translators:['calf-0','xuziqi'],logoAuthor:'Not separately credited on source page',license:'CC BY-SA 3.0 (page default; no separate exception stated)',sha256:createHash('sha256').update(b).digest('hex'),modifications:'Original file, unchanged'},null,2));console.log('Saved MMF logo',b.length);process.exit(0);
}catch(e){error=e}
throw error;
