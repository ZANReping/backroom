import {Session} from 'node:inspector'
import {writeFileSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(64,64)}})
const {buildHoundMeshJob,prepareHoundTextures}=await import('../src/game/renderer/houndMesh')
const {disposeL8Tree}=await import('../src/game/renderer/l8ModelResources')
const textures=prepareHoundTextures();while(!textures.next().done){}
const session=new Session();session.connect();const post=(name:string)=>new Promise<any>((resolve,reject)=>session.post(name as any,(err,res)=>err?reject(err):resolve(res)))
await post('Profiler.enable');await post('Profiler.start')
const costs:any[]=[];for(let i=0;i<3;i++){const it=buildHoundMeshJob(false,17+i,'hostile');let n,index=0;do{const t=performance.now();n=it.next();costs.push({i,index:index++,ms:performance.now()-t})}while(!n.done);disposeL8Tree(n.value)}
const {profile}=await post('Profiler.stop');session.disconnect();writeFileSync('reports/hound-l02-import-20261026/hound-cpu-profile.json',JSON.stringify(profile));console.log(JSON.stringify(costs.sort((a,b)=>b.ms-a.ms).slice(0,10)));console.log(JSON.stringify(profile.nodes.filter((n:any)=>n.hitCount>1).sort((a:any,b:any)=>b.hitCount-a.hitCount).slice(0,18).map((n:any)=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber,hits:n.hitCount}))))
