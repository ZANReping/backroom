import assert from 'node:assert/strict'
import * as THREE from 'three'
import {ALPHA_BLUEPRINT as b,ALPHA_UNSUPPORTED_MOUNTS,ALPHA_PLACEMENT_CLEARANCES,ALPHA_DOORWAYS} from '../src/game/content/alphaBlueprint'
import {alphaMountSupport,isAlphaWallMounted,alphaWorldParts,alphaOverlap} from '../src/game/content/alphaPlacement'
import {alphaParts,isAlphaKind} from '../src/game/content/alphaDecor'
import {alphaVesselGeometries} from '../src/game/renderer/alphaVesselMeshes'
import {ALPHA_DUTIES,insideAlphaDuty} from '../src/game/content/alphaDuties'
import {generateLevel,enableRuntimeStructCollisionIndex} from '../src/game/world/mapgen'
import {levelDefOf} from '../src/game/levels'
import {canOccupy} from '../src/game/core/player'
let checks=0,cups=0,basins=0
const check=(v:unknown,message:string)=>{checks++;assert(v,message)}
check(ALPHA_UNSUPPORTED_MOUNTS.length===0,'all wall props have a continuous backing wall')
for(const s of b.decorations!.filter(isAlphaWallMounted))check(Math.abs(alphaMountSupport(s,b.decorations!)!.gap-.002)<1e-6,`mount ${s.kind} @ ${s.x},${s.y}`)
for(const d of b.doors)check(!b.decorations!.some(s=>s.kind==='alpha_wall'&&s.data?.skin==='door_frame'&&Math.hypot(s.x+s.w/2-d.x-d.w/2,s.y+s.h/2-d.y-d.h/2)<1.1),'operable doors own a single frame')
const wallCuts=b.decorations!.filter(s=>s.kind==='alpha_wall'&&s.data?.skin!=='door_frame').flatMap(alphaWorldParts)
for(const d of ALPHA_DOORWAYS){
 const horizontal=d.side==='n'||d.side==='s'
 const frames=b.decorations!.filter(s=>s.data?.skin==='door_frame'&&Math.abs(horizontal?s.y+s.h/2-d.cy:s.x+s.w/2-d.cx)<.001&&Math.hypot(s.x+s.w/2-d.cx,s.y+s.h/2-d.cy)<1.2)
 const jambs=frames.filter(s=>!s.data?.z).sort((a,b)=>horizontal?a.x-b.x:a.y-b.y),header=frames.find(s=>Number(s.data?.z)>0)
 if(!header)continue
 const lo=horizontal?jambs[0].x+jambs[0].w:jambs[0].y+jambs[0].h,hi=horizontal?jambs[1].x:jambs[1].y
 const opening=horizontal?{x:lo-.004,y:header.y,w:hi-lo+.008,h:header.h}:{x:header.x,y:lo-.004,w:header.w,h:hi-lo+.008}
 check(!wallCuts.some(p=>p.bottom<Number(header.data!.z)-.004&&p.top>0&&alphaOverlap(p,opening)),'lining stands clear of every dressed wall cut '+d.room+'/'+d.side)
}
const geos=alphaVesselGeometries(),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide})
for(const s of b.decorations!.filter(s=>isAlphaKind(s.kind))){
 const ps=alphaParts(s)
 for(const liquid of ps.filter(p=>p.shape==='liquid_plane'||p.shape==='liquid_disc')){
  if(liquid.shape==='liquid_disc'){
   cups++
   const cup=ps.find(p=>p.shape==='cup'&&Math.abs(p.x+p.w/2-liquid.x-liquid.w/2)<1e-6&&Math.abs(p.y+p.d/2-liquid.y-liquid.d/2)<1e-6)!
   check(!!cup&&liquid.z>cup.z+cup.h*.5&&liquid.z<cup.z+cup.h*.85,'drink sits below the lip')
   const mesh=new THREE.Mesh(geos.cup,mat);mesh.scale.set(cup.w,cup.h,cup.d);mesh.position.set(cup.x+cup.w/2,cup.z+cup.h/2,cup.y+cup.d/2);mesh.updateMatrixWorld()
   for(const offset of [0,.22,-.22]){
    const ray=new THREE.Raycaster(new THREE.Vector3(cup.x+cup.w/2+cup.w*offset,cup.z+cup.h+.05,cup.y+cup.d/2),new THREE.Vector3(0,-1,0))
    const hit=ray.intersectObject(mesh)[0];check(!!hit&&hit.point.y<liquid.z-.02,'cup is actually open above the drink')
   }
  }else{
   basins++
   const z=liquid.z+liquid.h/2
   check(ps.some(p=>p.surface==='steel'&&p.z+p.h<z&&p.x<=liquid.x&&p.y<=liquid.y&&p.x+p.w>=liquid.x+liquid.w&&p.y+p.d>=liquid.y+liquid.d),'water has an actual recessed basin bottom')
   for(const p of ps)if(p!==liquid&&!p.shape)check(!(p.x<liquid.x+liquid.w-1e-5&&p.x+p.w>liquid.x+1e-5&&p.y<liquid.y+liquid.d-1e-5&&p.y+p.d>liquid.y+1e-5&&p.z<z&&p.z+p.h>z),'water never intersects a cabinet, worktop or basin wall')
  }
 }
}
Object.values(geos).forEach(g=>g.dispose());mat.dispose()
check(cups>=25&&basins>=8,'shared hollow models cover community mugs and every Alpha sink')
const m=generateLevel(levelDefOf(101)!,424242,true);enableRuntimeStructCollisionIndex(m)
check(m.npcs?.length===29&&Object.keys(ALPHA_DUTIES).length===29,'every resident has an authored post')
for(const n of m.npcs!){
 const d=ALPHA_DUTIES[n.id]
 check(!!d&&n.x===d.x&&n.y===d.y&&n.facing===d.facing,'exact assigned post '+n.id)
 check(canOccupy(m,n.x,n.y,.32,{z:0,band:0}),'clear standing volume '+n.id)
 check(!ALPHA_PLACEMENT_CLEARANCES.some(r=>n.x>r.x-.3&&n.x<r.x+r.w+.3&&n.y>r.y-.3&&n.y<r.y+r.h+.3),'post leaves doorway empty '+n.id)
 check(insideAlphaDuty(d,n.x,n.y)&&d.radius<=.65,'bounded duty '+n.id)
}
console.log(JSON.stringify({checks,mounts:b.decorations!.filter(isAlphaWallMounted).length,cups,basins,npcs:m.npcs!.length}))
