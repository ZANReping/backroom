import type { Plugin } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'

/** Local development artifacts only; never included in the shipped game. */
export function settlementVerifier():Plugin {
 return {name:'settlement-verifier-artifacts',apply:'serve',configureServer(server){
  server.middlewares.use('/__settlement_capture',async(req,res)=>{
   const origin=req.headers.origin
   if(req.method!=='POST'||!origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)){res.statusCode=403;res.end();return}
   try {
    let size=0;const chunks:Buffer[]=[]
    for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw new Error('Capture too large');chunks.push(Buffer.from(chunk))}
    const {name,data}=JSON.parse(Buffer.concat(chunks).toString())
    if(typeof name!=='string'||!/^settlement-(101|102|103|104|116)-(classic|realistic)-(entry|public|core|living|up|plan|stats|memory|hall-up|street|street-up|vault|vault-up|logistics|logistics-up|living-up)\.(png|svg|json)$/.test(name)||typeof data!=='string')throw new Error('Invalid artifact')
    const dir=path.resolve(server.config.root,'.check',name.startsWith('settlement-102-')?'bntg-v3':'settlements-v2');await fs.mkdir(dir,{recursive:true})
    const buffer=name.endsWith('.png')?Buffer.from(data.replace(/^data:image\/png;base64,/,''),'base64'):Buffer.from(data)
    await fs.writeFile(path.join(dir,name),buffer);res.setHeader('Content-Type','application/json');res.end('{"ok":true}')
   }catch(error){res.statusCode=400;res.end(String(error))}
  })
 }}
}
