import fs from 'node:fs'
import path from 'node:path'
import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
const baseline='reports/offscreen-20261108/source-before/src__game__world__mapSight.ts'
if(!fs.existsSync(baseline))throw Error('Keep the task source-before fixture to reproduce map parity')
fs.mkdirSync('.cache',{recursive:true})
const source=`import assert from 'node:assert/strict';import {createCanvas}from'@napi-rs/canvas';
Object.assign(globalThis,{document:{createElement:()=>createCanvas(64,64),getElementById:()=>null,body:{appendChild(){}},addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
const {Engine}=await import('./src/game/engine');const {audio}=await import('./src/game/core/audio');
for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio)))if(k!=='constructor'&&typeof audio[k]==='function')audio[k]=()=>{};
const {mapSight}=await import('./src/game/world/mapSight');const {mapSight:before}=await import('before-map-sight');
let checks=0;
for(const level of [0,1,2,3,4,5,6,7,8,9,10,11,101,102,103,104,116]){
 const e=new Engine();e.seed=424242;e.loadLevel(level,{mapSeed:424242,firstVisit:false});
 for(const [dx,dy]of [[0,0],[2,-2],[-3,1]])for(const yaw of [0,.63,Math.PI,5.1]){
  const p={...e.player};e.player.x+=dx;e.player.y+=dy;e.time+=.1;
  assert.deepEqual(mapSight(e,yaw),before(e,yaw),'Level '+level+' pose '+dx+','+dy+' yaw '+yaw);
  checks++;Object.assign(e.player,p)
 }
}
console.log(JSON.stringify({checks,ok:true}));`
await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'worker-map-parity.ts'},bundle:true,platform:'node',format:'esm',external:['@napi-rs/canvas'],outfile:'.cache/check-worker-map-parity.mjs',define:{'import.meta.env':'{}'},plugins:[{name:'before-map-sight',setup(b){b.onResolve({filter:/^before-map-sight$/},()=>({path:'before-map-sight',namespace:'before-map'}));b.onLoad({filter:/.*/,namespace:'before-map'},()=>({contents:fs.readFileSync(baseline,'utf8'),loader:'ts',resolveDir:path.resolve('src/game/world')}))}}]})
const result=spawnSync(process.execPath,['.cache/check-worker-map-parity.mjs'],{encoding:'utf8'});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');fs.mkdirSync('reports/offscreen-20261108',{recursive:true});fs.writeFileSync('reports/offscreen-20261108/map-parity.json',JSON.stringify({ok:result.status===0,exitCode:result.status,stdout:result.stdout,stderr:result.stderr},null,2))
process.exitCode=result.status??1
