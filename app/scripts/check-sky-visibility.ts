import assert from 'node:assert/strict'
import * as THREE from 'three'
import { skyAccessAt, skyOpeningInView, indoorFogRange, setSkyAccess, skyVisibilityUniforms, usesWorldSky, type SkyOpening } from '../src/game/renderer/skyVisibility'
import type { GameMap } from '../src/game/world/mapgen'
import { makeSkyMesh } from '../src/game/renderer/skybox'
import { l11MetroRampHeight } from '../src/game/world/l11Metro'
import type { LevelDef } from '../src/game/core/types'

const n = 192
const bytes = () => new Uint8Array(n * n)
function map(): GameMap {
  return { w:n,h:n,tiles:bytes().fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
    wet:bytes(),elev:bytes(),outdoor:bytes(),step:bytes(),crawl:bytes(),ceiling:bytes(),up:bytes(),upWall:bytes(),up2:bytes(),upWall2:bytes(),stair:new Int32Array(n*n),
    liquid:bytes(),seaFloor:new Float32Array(n*n),floors:1,dn:bytes(),dnWall:bytes(),tint:bytes() }
}
let count = 0
const check = (value: unknown, message: string) => { assert(value, message); count++ }

for (let level=0; level<=11; level++) check(usesWorldSky(level) === [6,7,9,10,11].includes(level), `world sky profile ${level}`)
for (const [near,far,cameraFar] of [[.1,100,100],[2,500,240],[10,30,20]] as const) {
  const [a,b] = indoorFogRange(near,far,cameraFar)
  check(a < b && b <= cameraFar*.94 + 1e-9, `indoor fog range ${near}/${far}/${cameraFar}`)
}

for (const level of [2,3,4,5]) {
  const m=map(); check((skyAccessAt(m,level,16,16,0,1).amount===0), `enclosed L${level} does not draw sky`)
  // This runs without a DOM/WebGL context: allocating even a fallback sky
  // texture on the fully indoor path would fail before the assertion.
  check(makeSkyMesh(m,{id:level} as LevelDef)===null,`L${level} allocates no sky`)
}
check(skyAccessAt(map(),0,16,16,0,1).amount===0, 'unsupported indoor level has no sky')
const opening: SkyOpening={x0:26,z0:120,x1:29,z1:130,height:0}
const camera=new THREE.PerspectiveCamera(70,1,.1,200);camera.position.set(27.5,-3.45,132);camera.lookAt(27.5,0,125);camera.updateMatrixWorld(true)
check(skyOpeningInView(opening,camera),'metro opening in view')
camera.lookAt(27.5,-3.45,139);camera.updateMatrixWorld(true)
check(!skyOpeningInView(opening,camera),'metro opening behind camera is hidden')

const u=skyVisibilityUniforms();const fog=new THREE.Color('#806a42');const eye=new THREE.Vector3(27.5,1.7,132)
setSkyAccess(u,2,eye,fog,opening)
check(u.uSkyIndoor.value.equals(fog)&&u.uSkyIndoor.value!==fog,'indoor background copies fog without aliasing it')
check(u.uSkyAmount.value===1&&u.uSkyPortal.value===1,'sky access amount is clamped and portal enabled')
check(u.uSkyOpening.value.x===opening.x0-eye.x&&u.uSkyOpening.value.y===opening.z0-eye.z&&u.uSkyOpening.value.z===opening.x1-eye.x&&u.uSkyOpening.value.w===opening.z1-eye.z&&u.uSkyOpeningY.value===opening.height-eye.y,'portal becomes camera-relative')
setSkyAccess(u,-1,eye,fog);check(u.uSkyAmount.value===0&&u.uSkyPortal.value===0,'sky access closes portal and clamps low amount')

const l6=map();l6.hasUnderground=true
check(skyAccessAt(l6,6,16,16,-10, -9).amount===0,'L6 underground has no sky')
const l7=map();l7.floors=2;l7.up.fill(1);l7.structures.push({kind:'hoteldoor',x:16,y:16,w:1,h:1,data:{l7porch:true,open:false}} as any)
check(skyAccessAt(l7,7,16,16,3,4).amount===0,'L7 upper cabin closed door has no sky')
check(skyAccessAt(l7,7,16,16,6,7.55).amount===1,'L7 flying above the cabin retains sky')
;(l7.structures[0] as any).data.open=true
check(skyAccessAt(l7,7,16,16,3,4).amount===1,'L7 porch opening restores sky')

function l11Map(ox=0,oy=0): GameMap {
  const m=map();m.inf={ox,oy,seed:17,chunks:new Map(),rev:1} as any
  m.dn.fill(1);return m
}
const metro=l11Map();
const below=skyAccessAt(metro,11,27,125,-4,-3);const surface=skyAccessAt(metro,11,27,125,0,1)
check(below.opening!==undefined&&below.amount===1,'L11 underground ramp exposes a bounded opening')
check(surface.opening===undefined&&surface.amount===1,'L11 surface does not synthesize an opening')
for (const shift of [-512,0,512,1024]) {
  const m=l11Map(shift,shift);const a=skyAccessAt(m,11,27,125,-4,-3)
  check(a.opening!==undefined&&Math.abs((a.opening!.x0+m.inf!.ox)-(26+shift))<1e-6,'L11 periodic rebasing preserves opening world x')
  check(a.opening!==undefined&&Math.abs((a.opening!.z0+m.inf!.oy)-(120+shift))<1e-6,'L11 periodic rebasing preserves opening world z')
  check(a.enclosure>=0&&a.enclosure<=1,'L11 ramp enclosure remains bounded')
}

const rebased=l11Map(-16,96)
const original=skyAccessAt(metro,11,27.5,125,-2.5,-.95)
const shifted=skyAccessAt(rebased,11,43.5,29,-2.5,-.95)
check(original.amount===shifted.amount&&original.enclosure===shifted.enclosure,'rebase does not change visibility or atmosphere')
const a=skyVisibilityUniforms(),b=skyVisibilityUniforms()
setSkyAccess(a,original.amount,new THREE.Vector3(27.5,-.95,125),fog,original.opening)
setSkyAccess(b,shifted.amount,new THREE.Vector3(43.5,-.95,29),fog,shifted.opening)
check(a.uSkyOpening.value.equals(b.uSkyOpening.value)&&a.uSkyOpeningY.value===b.uSkyOpeningY.value,'rebase leaves shader opening coordinates unchanged')
let previous=0
for(let y=120;y<=130;y+=.1){
  const feet=l11MetroRampHeight(27.5,y,17)!
  const access=skyAccessAt(metro,11,27.5,y,feet,feet+1.55)
  check(access.enclosure>=previous-1e-9&&access.enclosure-previous<.03,'walking down ramp continuously increases enclosure')
  previous=access.enclosure
}
check(previous>.99,'ramp reaches fully enclosed atmosphere')
check(skyAccessAt(metro,11,27,185,-5,-3.45).amount===0,'remote underground stops sky even if looking toward distant entrance')
const canal=l11Map()
canal.inf!.chunks.set('0,3',{l11:{seed:17,canals:[{water:[[[[20,120],[30,120],[30,128],[20,128],[20,120]]]]}],bridges:[]}} as any)
check(skyAccessAt(canal,11,27,125,-1.1,.45).enclosure===0,'canal below street grade is not classified as metro')

console.log(`Sky visibility / indoor occlusion: ${count} assertions passed`)
