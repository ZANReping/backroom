/** CPU work and elapsed wait are separate; a parallel compile wait is not a frame stall. */
const stages=new Map<string,{count:number;total:number;max:number;last:number}>()
export function recordL1BuildStage(name:string,ms:number){const s=stages.get(name)??{count:0,total:0,max:0,last:0};s.count++;s.total+=ms;s.max=Math.max(s.max,ms);s.last=ms;stages.set(name,s)}
export function *measureL1BuildJob(name:string,job:Generator<void,void,unknown>):Generator<void,void,unknown>{
 const start=performance.now();let complete=false
 try{while(true){const t=performance.now(),r=job.next();recordL1BuildStage(name+'Cpu',performance.now()-t);if(r.done){complete=true;break}yield}}
 finally{if(!complete)job.return();recordL1BuildStage(name+'Elapsed',performance.now()-start)}
}
export function l1BuildMetrics(){return Object.fromEntries([...stages].map(([k,v])=>[k,{...v,mean:v.total/v.count}]))}
