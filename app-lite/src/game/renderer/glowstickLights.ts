import type {Engine} from '../engine'
import type {LightSource} from '../core/types'
import {floorHeight} from '../world/mapgen'
/** Derived from physical items every frame. No orphan lights in saves or after pickup. */
const caches=new WeakMap<Engine,Map<string,LightSource>>()
export function glowstickLights(eng:Engine){
 let cache=caches.get(eng);if(!cache){cache=new Map();caches.set(eng,cache)}
 const lights:LightSource[]=[],seen=new Set<string>(),m=eng.map!
 const add=(id:string,x:number,y:number,z:number)=>{let l=cache!.get(id);if(!l){l={x,y,r:1.8,color:'#61ff67',flickerSeed:0,noFix:1,keep:1,intensityMul:.25};cache!.set(id,l)}l.x=x;l.y=y;l.fixZ=z+.2;seen.add(id);lights.push(l)}
 if(!eng.levelDef.noFlashlight){
  for(const it of m.items)if(it.type==='glowstick'&&!it.fake)add(`i${it.id}`,it.x,it.y,(it.z??floorHeight(m,it.x,it.y))+.45)
  for(const pr of eng.projectiles)if(pr.type==='glowstick')add(`p${pr.id}`,pr.x,pr.y,pr.z)
 }
 for(const id of cache.keys())if(!seen.has(id))cache.delete(id)
 return lights
}
