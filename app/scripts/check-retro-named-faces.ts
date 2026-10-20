import assert from 'node:assert/strict'
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createCanvas,loadImage} from '@napi-rs/canvas'
import * as THREE from 'three'
import {NPCS,npcAvatar,brcWorkerDef,genRandomNpcs} from '../src/game/content/npcs'
import {ALPHA_PEOPLE} from '../src/game/content/alphaPeople'
import {L11_PEOPLE} from '../src/game/content/l11People'
import {RETRO_NPC_IDS,retroNpcTexturesSync,retroTexture} from '../src/game/renderer/retroNpc'
import {RETRO_NAMED_FACE_IDS} from '../src/game/renderer/retroNamedFaces'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {buildAvatarModel} from '../src/game/renderer/retroAvatar'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import {DEFAULT_AVATAR} from '../src/game/core/avatar'
let checks=0;const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
const all=new Map([...Object.values(NPCS),...Object.values(ALPHA_PEOPLE),...L11_PEOPLE].map(d=>[d.id,d]))
const need=[...all.values()].filter(d=>d.id!=='tiny'&&d.faction!=='brc'&&!(RETRO_NPC_IDS as string[]).includes(d.id))
ok(RETRO_NAMED_FACE_IDS.size===need.length,'Registry exactly covers current fixed NPCs')
const hashes=new Map<string,string>(),canvas=createCanvas(128,128),ctx=canvas.getContext('2d'),rows=[]
for(const d of need){
 ok(RETRO_NAMED_FACE_IDS.has(d.id),'Face registered '+d.id)
 const base=`public/textures/npc-retro/named/${d.id}/`,pixels=[]
 for(const name of ['neutral','neutral-blink']){
  const file=base+name+'.png',bytes=readFileSync(file);ok(bytes.readUInt32BE(16)===128&&bytes.readUInt32BE(20)===128&&bytes[25]===6,'128² RGBA '+file)
  const im=await loadImage(file);ctx.clearRect(0,0,128,128);ctx.drawImage(im,0,0);pixels.push(ctx.getImageData(0,0,128,128).data)
 }
 const hash=createHash('sha256').update(readFileSync(base+'neutral.png')).digest('hex');ok(!hashes.has(hash),'Unique face '+d.id);hashes.set(hash,d.id)
 let blinkChanges=0,hairPixels=0
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const i=(y*128+x)*4,a=pixels[0],b=pixels[1];assert(a[i+3]===b[i+3],d.id+' identical hair mask while blinking')
  if(a[i+3]<128)hairPixels++
  if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]){blinkChanges++;assert(y>=35&&y<=58,d.id+' blink changes only eyes')}
  if(x>=40&&x<=87&&y>=44&&y<=55)assert(a[i+3]>=245,d.id+' eyes not classified as hair')
 }checks+=3;ok(blinkChanges>0,'Blink changes eyes '+d.id)
 const m=buildCharacterModel(npcAvatar(d),{npcId:d.id,npcDef:d}),rig=m.userData.retro,face=rig.mesh.material[1] as THREE.MeshLambertMaterial
 ok(face.map===retroTexture(`/textures/npc-retro/named/${d.id}/neutral.png`),'Factory uses named face '+d.id)
 ok(!face.transparent&&face.opacity===1&&face.customProgramCacheKey()!==rig.mesh.material[0].customProgramCacheKey(),'Opaque face has separate shader '+d.id)
 ok(!!m.userData.npcGear,'Fitted gear preserved '+d.id);disposeCharacterModel(m);rows.push({id:d.id,hash,hairPixels,blinkChanges})
}
for(const id of RETRO_NPC_IDS){const d=all.get(id)!,m=buildCharacterModel(npcAvatar(d),{npcId:id,npcDef:d});ok(m.userData.retro.mesh.material[1].map===retroNpcTexturesSync(id).face,'Hand-authored identity retained '+id);disposeCharacterModel(m)}
const random=genRandomNpcs(()=>.44,1)[0],generic=buildCharacterModel(npcAvatar(random),{npcId:random.id,npcDef:random}),normal=buildAvatarModel(DEFAULT_AVATAR),unknown=buildAvatarModel(DEFAULT_AVATAR,{faceId:'unregistered'}),worker=brcWorkerDef(55,0,0,0),brc=buildCharacterModel(npcAvatar(worker),{npcId:worker.id,npcDef:worker})
ok(normal.userData.retro.mesh.material[1].map===unknown.userData.retro.mesh.material[1].map,'Unregistered faceId falls back to pool')
ok(brc.userData.retro.mesh.material[2].map===retroTexture('/textures/npc-retro/faceless/t4.png'),'BRC retains dark faceless material')
for(const m of [generic,normal,unknown,brc])disposeCharacterModel(m)
for(const gender of ['m','f'])for(let tier=0;tier<5;tier++)for(let v=0;v<3;v++)for(const expr of v===0?['neutral','smile','serious','sleepy']:['neutral']){
 const base=`public/textures/npc-retro/pool/${gender}${tier}-${v}/`;for(const suffix of ['', '-blink']){const file=base+expr+suffix+'.png';ok(existsSync(file),'Pool expressions retained '+file);const b=readFileSync(file);ok(b[25]===6,'Pool has hair alpha '+file)}
}
mkdirSync('reports/npc-faces-v6',{recursive:true});writeFileSync('reports/npc-faces-v6/check.json',JSON.stringify({checks,named:need.length,duplicates:0,rows},null,2));console.log(`NPC faces v6: ${checks} checks passed; ${need.length} unique named faces`)
