import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createTradersMap,generateTradersChunk} from '../src/game/world/tradersWorld'
import {levelDefOf} from '../src/game/levels'
import {buildTradersFitout} from '../src/game/renderer/tradersFitoutMeshes'
import {bakeTradersProp,type TradersAssets} from '../src/game/renderer/tradersMeshes'
import {bakeTradersGeometry,clearTradersBakeCache} from '../src/game/renderer/tradersBakedLighting'
import {TRADERS_VAULT_CELLS} from '../src/game/content/tradersLayout'
const materials=new Map<string,THREE.Material>(),assets={materials,material:(surface:string,color:string)=>{const key=surface+color;let m=materials.get(key);if(!m){m=new THREE.MeshStandardMaterial({color});m.userData.tradersShared=true;materials.set(key,m)}return m}} as unknown as TradersAssets
const m=createTradersMap(levelDefOf(102)!,424242),cell=TRADERS_VAULT_CELLS.find(c=>c.storage==='ordinary')!
generateTradersChunk(m,Math.floor((cell.x+cell.w/2)/32),Math.floor((cell.y+cell.h/2)/32))
const s=m.structures.find(s=>s.data?.dressing==='storageRack')!,rows:{round:number;vertexMs:number;probeMs:number;triangles:number;maxDifference:number;rmsDifference:number}[]=[]
assert(s)
for(let round=-1;round<5;round++){
 const root=buildTradersFitout(s,assets)!,meshes:THREE.Mesh[]=[];root.updateMatrixWorld(true);root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh)})
 const reference:Float32Array[]=[];clearTradersBakeCache();let start=performance.now()
 for(const mesh of meshes){const it=bakeTradersGeometry(mesh.geometry,mesh.matrixWorld);while(!it.next().done){}reference.push(new Float32Array(mesh.geometry.getAttribute('tradersLight').array))}
 const vertexMs=performance.now()-start;clearTradersBakeCache();start=performance.now()
 const it=bakeTradersProp(root,assets);while(!it.next().done){}
 const probeMs=performance.now()-start;let maxDifference=0,triangles=0,squaredDifference=0,valueCount=0
 for(let i=0;i<meshes.length;i++){const g=meshes[i].geometry,a=g.getAttribute('tradersLight').array;triangles+=(g.index?.count??g.getAttribute('position').count)/3;for(let j=0;j<a.length;j++){assert(Number.isFinite(a[j]));const delta=a[j]-reference[i][j];maxDifference=Math.max(maxDifference,Math.abs(delta));squaredDifference+=delta*delta;valueCount++}g.dispose()}
 if(round>=0)rows.push({round:round+1,vertexMs,probeMs,triangles,maxDifference,rmsDifference:Math.sqrt(squaredDifference/Math.max(1,valueCount))})
}
const median=(a:number[])=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],vertexMedianMs=median(rows.map(r=>r.vertexMs)),probeMedianMs=median(rows.map(r=>r.probeMs))
for(const material of materials.values())material.dispose()
console.log(JSON.stringify({scope:'CPU bake only; same production rack mesh and world lighting; not a GPU frame benchmark',seed:424242,object:s.data?.tradersId,rounds:rows,vertexMedianMs,probeMedianMs,speedup:vertexMedianMs/Math.max(.001,probeMedianMs)},null,2))
