import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createCanvas} from '@napi-rs/canvas'
import '../src/game/world/mapgen'
import {LEVELS} from '../src/game/levels'
import {genL0Architecture,l0Layout,L0_HEIGHT} from '../src/game/world/l0Architecture'
import {l0BaseRegion,l0EnvironmentAt,l0EffectPatches,legacyL0Region} from '../src/game/world/l0Regions'
import {infiniteImplFor} from '../src/game/world/infinite'
import {drawL0Map,L0_MAP_KEY} from '../src/game/content/l0Map'
import type {Engine} from '../src/game/engine'

const def=LEVELS.find(l=>l.id===0)!,seed=20261006
assert(!Object.keys(infiniteImplFor(0).variantNames).includes('pillars'),'legacy pillars must not remain a second menu choice')
let merged=0,redSamples=0,props=0
for(let cy=-12;cy<=12;cy++)for(let cx=-12;cx<=12;cx++){
 assert.notEqual(l0BaseRegion(7391,cx,cy),'pillars');merged++
 if(legacyL0Region(7391,cx,cy)==='pillars'){
  const c=genL0Architecture(def,7391,cx,cy)
  for(const it of c.items)assert(!c.l0!.walls.some(w=>it.x>w.x&&it.x<w.x+w.w&&it.y>w.y&&it.y<w.y+w.h),'merged pillar buries immutable supply')
 }
 for(const p of l0EffectPatches(7391,cx,cy).filter(p=>p.kind==='red'))for(const [x,y]of [[p.x-p.rx+.261,p.y],[p.x+p.rx-.261,p.y],[p.x,p.y-p.ry+.261],[p.x,p.y+p.ry-.261],[p.x,p.y]]){
  assert(l0EnvironmentAt(7391,x,y).red>.999999,'red enclosure has an unconverted inside edge');redSamples++
 }
}
const arch=l0Layout(seed,3,0),piers=arch.walls.filter(w=>w.surface==='khaki')
assert.equal(piers.length,arch.arches.length+1,'each arch row needs its final support')
for(const bay of arch.arches){
 assert(piers.some(p=>Math.abs(p.y-(bay.y+bay.length))<1e-6&&p.top===L0_HEIGHT),'unsupported arch end')
 const sill=arch.walls.find(w=>w.surface==='cream'&&w.top===1.04&&Math.abs(w.y-bay.y)<1e-6)
 assert(sill&&Math.abs(sill.h-bay.length)<1e-6,'sill leaves a crack under its arch')
}
for(let n=0;n<64;n++){const a=l0Layout(n,5,5,'arch');props+=(a.props??[]).length;assert.deepEqual(a.props,l0Layout(n,5,5,'arch').props)}
assert(props>30&&props<120,'barrel placement should be probabilistic and repeatable')
const archRaw=genL0Architecture(def,seed,3,0),propColliders=archRaw.structures.filter(s=>s.data?.l0Prop)
assert.equal(propColliders.length,2);assert(archRaw.l0!.props!.every(p=>propColliders.some(s=>Math.abs(s.x+s.w/2-p.x)<1e-6&&Math.abs(Number(s.data?.top)-p.height)<1e-6)))

const cells=[0,3,6,9,12,15,18].map(cx=>{const raw=genL0Architecture(def,seed,cx,0);return{...raw,key:`${cx},0`,cx,cy:0}})
const m={w:608,h:32,inf:{ox:0,oy:0,l0:{},chunks:new Map(cells.map(c=>[c.key,c])),explored:new Map()},tiles:new Uint8Array(608*32).fill(1)}
const eng={map:m,devEnabled:true,dev:{mapReveal:true},explored:new Uint8Array(608*32)} as unknown as Engine
const sheet=createCanvas(7*240,260),g=sheet.getContext('2d')
const legendNames=['Yellow','Arches','Pillar hall','Pits','Blackout','Red rooms','Manila']
for(let i=0;i<cells.length;i++){
 const x=cells[i].cx*32;g.save();g.translate(i*240-x*7.5,20)
 drawL0Map(g as unknown as CanvasRenderingContext2D,eng,{x0:x,y0:0,x1:x+32,y1:32,scale:7.5});g.restore()
 g.fillStyle='#ffffff';g.font='12px sans-serif';g.fillText(legendNames[i],i*240+6,14)
 assert.equal(cells[i].l0!.mapRegions!.length,1024)
}
assert.equal(eng.explored.reduce((s,v)=>s+v,0),0,'drawing reveal wrote exploration')
const fog=createCanvas(240,240),fg=fog.getContext('2d');eng.dev.mapReveal=false
drawL0Map(fg as unknown as CanvasRenderingContext2D,eng,{x0:0,y0:0,x1:32,y1:32,scale:7.5})
assert(fg.getImageData(0,0,240,240).data.every(v=>v===0),'fog leaked unexplored terrain or wall segments')
assert.equal(new Set(L0_MAP_KEY.map(k=>k.color)).size,7,'regional legend colors overlap')
eng.explored[16*m.w+16]=1
drawL0Map(fg as unknown as CanvasRenderingContext2D,eng,{x0:0,y0:0,x1:32,y1:32,scale:7.5})
assert(fg.getImageData(121,121,1,1).data[3]>0,'explored terrain missing')
assert.equal(fg.getImageData(10,10,1,1).data[3],0,'a discovered cell revealed the rest of the region')
eng.dev.mapReveal=true;fg.clearRect(0,0,240,240);fg.translate(.3,.6)
let rectCalls=0;const fill=fg.fillRect.bind(fg)
fg.fillRect=(x,y,w,h)=>{rectCalls++;fill(x,y,w,h)}
drawL0Map(fg as unknown as CanvasRenderingContext2D,eng,{x0:0,y0:0,x1:32,y1:32,scale:4})
assert(rectCalls<256,'map floor fell back to one rectangle per metre cell')
const floorPixels=fg.getImageData(6,6,12,12).data
for(let i=0;i<floorPixels.length;i+=4)assert.equal(floorPixels[i],0x49,'fractional map translation caused striped floor seams')
const dir=`reports/l0-remake/${process.env.QA_TAG??'iteration-17'}`;await mkdir(dir,{recursive:true})
await writeFile(`${dir}/map-symbols.png`,sheet.toBuffer('image/png'))
await writeFile(`${dir}/presentation-checks.json`,JSON.stringify({pass:true,mergedRegions:merged,redInteriorSamples:redSamples,arches:arch.arches.length,piers:piers.length,propSamples:64,totalProps:props,regionStyles:7,fogPreserved:true,rectCalls},null,2))
console.log('L0 presentation checks passed:',{merged,redSamples,props})
