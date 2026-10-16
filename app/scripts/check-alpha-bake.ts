import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { ALPHA_BLUEPRINT, ALPHA_LIGHTS } from '../src/game/content/alphaBlueprint'
import { alphaBakeFingerprint, alphaBakeParts, ALPHA_BAKE_VERSION } from '../src/game/content/alphaBakeLayout'
import { alphaWorldParts } from '../src/game/content/alphaPlacement'
import { alphaParts } from '../src/game/content/alphaDecor'
let checks=0
const check=(ok:unknown,label:string)=>{checks++;assert(ok,label)}
const dir='public/assets/alpha-bake/',manifest=JSON.parse(readFileSync(dir+'manifest.json','utf8'))
const parts=alphaBakeParts(ALPHA_BLUEPRINT.decorations!),raw=gunzipSync(readFileSync(dir+'rects.bin.gz')),rects=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2)
check(manifest.version===ALPHA_BAKE_VERSION,'bake version')
check(manifest.fingerprint===alphaBakeFingerprint(parts,ALPHA_LIGHTS),'geometry and lamps match published transport')
check(parts.length===manifest.parts&&rects.length===parts.length*24,'every part has exactly six face charts')
check(manifest.controls.radioWallOccludes&&manifest.controls.radioDoorTransmits,'actual wall blocks transport, actual doorway transmits')
for(let i=0;i<rects.length;i+=4){
 check(rects[i]>=1&&rects[i+1]>=1&&rects[i+2]>=1&&rects[i+3]>=1,'nonempty charts have leading gutters')
 check(rects[i]+rects[i+2]<manifest.width&&rects[i+1]+rects[i+3]<manifest.height,'charts and trailing gutters remain inside atlas')
}
const img=await loadImage(dir+'irradiance.png'),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
const pixels=ctx.getImageData(0,0,img.width,img.height).data
const energy=(id:number,face:number)=>{const k=id*24+face*4,x=rects[k]+Math.floor(rects[k+2]/2),y=rects[k+1]+Math.floor(rects[k+3]/2),i=(y*img.width+x)*4;return [.2126,.7152,.0722].reduce((v,w,j)=>v+w*(pixels[i+j]/255)**2*4,0)}
const desk=parts.findIndex(p=>p.structure.kind==='alpha_radio'&&p.part.solid&&p.part.w>4&&p.part.h<.1)
check(desk>=0,'radio work surface exists')
check(energy(desk,2)>energy(desk,3)*1.5,'console top receives more light than its underside')
// Rotated sub-parts use the same frame for placement, bake and collision bounds.
for(const s of ALPHA_BLUEPRINT.decorations!.filter(s=>s.kind==='alpha_swivel')){
 const local=alphaParts(s),world=alphaWorldParts(s),baked=alphaBakeParts([s])
 local.forEach((p,i)=>{if(!p.yaw)return
  const b=baked[i],halfX=(Math.abs(b.c)*p.w+Math.abs(b.s)*p.d)/2,halfY=(Math.abs(b.s)*p.w+Math.abs(b.c)*p.d)/2
  check(Math.abs(world[i].x-(b.x-halfX))<1e-6&&Math.abs(world[i].y-(b.z-halfY))<1e-6,'caster/spoke transforms match transport and placement')
 })
}
console.log(JSON.stringify({checks,parts:parts.length,atlas:[img.width,img.height],worktop:energy(desk,2),underside:energy(desk,3),bytes:manifest.pngBytes+manifest.rectBytes}))
