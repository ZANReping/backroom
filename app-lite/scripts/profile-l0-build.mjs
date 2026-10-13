import {writeFileSync} from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:9235/json/list')).json(),page=pages.find(p=>p.url.includes('/verifier/l0-remake.html'));
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const jobs=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data),p=jobs.get(m.id);if(p){jobs.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;jobs.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
try{
 await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});await send('Profiler.start');
 const result=await send('Runtime.evaluate',{expression:'(async()=>{await qa.normal(8421327,16,16);const warm=await qa.warm();return {warm,build:qa.buildStats(),stats:qa.stats()}})()',returnByValue:true,awaitPromise:true});
 const {profile}=await send('Profiler.stop');writeFileSync(new URL('../reports/l0-remake/iteration-16/build.cpuprofile',import.meta.url),JSON.stringify(profile));
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),f=n.callFrame,key=`${f.functionName} ${f.url.split('/').slice(-2).join('/').split('?')[0]}:${f.lineNumber+1}`;times.set(key,(times.get(key)??0)+(profile.timeDeltas[i]??1000))}
 const top=[...times].map(([name,us])=>({name,ms:us/1000})).sort((a,b)=>b.ms-a.ms).slice(0,45),report={result,top};
 writeFileSync(new URL('../reports/l0-remake/iteration-16/build-profile.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{ws.close()}
