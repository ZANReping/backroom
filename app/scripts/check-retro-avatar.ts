import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import * as THREE from 'three'
import { DEFAULT_AVATAR, HAIR_NAMES, TOP_STYLE_NAMES, PANTS_STYLE_NAMES, BEARD_NAMES, SKIN_OPTIONS } from '../src/game/core/avatar'
import { buildAvatarModel, buildRetroNamedNpc, avatarSpec, skinTier, fitLegacyAttachments } from '../src/game/renderer/retroAvatar'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { RETRO_NPC_IDS } from '../src/game/renderer/retroNpc'
let checks=0
const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
const stats:object[]=[]
function inspect(root:THREE.Group,label:string) {
  let draws=0,tris=0
  root.traverse(o=>{
    const m=o as THREE.SkinnedMesh;if(!m.isSkinnedMesh)return
    const g=m.geometry,p=g.getAttribute('position'),w=g.getAttribute('skinWeight'),bi=g.getAttribute('skinIndex')
    draws+=g.groups.length;tris+=p.count/3
    for(const [name,a] of Object.entries(g.attributes))ok(Array.from(a.array).every(Number.isFinite),label+' finite '+name)
    ok(Array.from(g.getAttribute('uv').array).every(v=>v>=-1e-5&&v<=1.00001),label+' bounded UVs')
    let valid=true
    for(let i=0;i<w.count;i++){let sum=0;for(let j=0;j<4;j++){sum+=w.array[i*4+j];valid&&=bi.array[i*4+j]>=0&&bi.array[i*4+j]<19}valid&&=Math.abs(sum-1)<1e-5}
    ok(valid,label+' normalized weights / bone indices')
    for(const t of [0,.2,2.4,5.6]){
      root.userData.retroUpdate(t);root.updateMatrixWorld(true);m.skeleton.update()
      ok(Array.from(m.skeleton.boneMatrices).every(Number.isFinite),label+' finite pose')
    }
    ok(m.skeleton.bones.length===19,label+' 19 bones')
  })
  ok(tris>1500&&tris<4200,label+' bounded geometry');ok(draws<=7,label+' at most 7 material groups')
  for(const part of ['head','torso','armL','armR','legL','legR'])ok(root.userData.parts[part]?.isBone,label+' legacy joint '+part)
  stats.push({label,tris,draws})
  disposeCharacterModel(root)
}
for(const [field,values] of Object.entries({hair:HAIR_NAMES,topStyle:TOP_STYLE_NAMES,pantsStyle:PANTS_STYLE_NAMES,beard:BEARD_NAMES,face:[0,1,2,3],glasses:[0,1,2,3],shoes:[0,1,2]}))
  for(let i=0;i<values.length;i++)for(const gender of [0,1])inspect(buildAvatarModel({...DEFAULT_AVATAR,gender,[field]:i}),`${field}:${i}/gender:${gender}`)
for(const ev of [{gloves:true},{suit:true},{cavingsuit:true},{divemask:true},{headlamp:true},{nightvision:true}])inspect(buildAvatarModel(DEFAULT_AVATAR,{ev}),JSON.stringify(ev))
for(const id of RETRO_NPC_IDS)inspect(buildRetroNamedNpc(id)!,id)
for(let i=0;i<SKIN_OPTIONS.length;i++)ok(skinTier(SKIN_OPTIONS[i])===i,'skin tier')
ok(JSON.stringify(avatarSpec(DEFAULT_AVATAR,{seed:5}))===JSON.stringify(avatarSpec(DEFAULT_AVATAR,{seed:5})),'seeded shape stable')
const a=buildAvatarModel(DEFAULT_AVATAR),b=buildAvatarModel(DEFAULT_AVATAR),ar=a.userData.retro,br=b.userData.retro
ok(ar.mesh.geometry!==br.mesh.geometry&&ar.mesh.material[0]!==br.mesh.material[0]&&ar.mesh.skeleton!==br.mesh.skeleton,'private geometry material skeleton')
ok(ar.mesh.material[0].map===br.mesh.material[0].map,'shared image')
ar.mesh.skeleton.computeBoneTexture();let freed=0;ar.mesh.skeleton.boneTexture.addEventListener('dispose',()=>freed++)
disposeCharacterModel(a);ok(freed===1,'bone texture released');ok(br.mesh.geometry.attributes.position.count>0,'other instance alive')
const gear=new THREE.Object3D();gear.position.set(.1,.1,.1);b.userData.parts.head.add(gear);fitLegacyAttachments(b);const position=gear.position.clone();fitLegacyAttachments(b);ok(position.equals(gear.position),'attachment conversion idempotent');disposeCharacterModel(b)
for(const g of ['m','f'])for(let k=0;k<5;k++)for(let v=0;v<3;v++)for(const ex of v?['neutral']:['neutral','smile','serious','sleepy'])for(const suffix of ['','-blink'])ok(existsSync(`public/textures/npc-retro/pool/${g}${k}-${v}/${ex}${suffix}.png`),'texture exists')
mkdirSync('reports/retro-avatar-import',{recursive:true});writeFileSync('reports/retro-avatar-import/geometry.json',JSON.stringify({checks,stats},null,2))
console.log(`Retro avatar: ${checks} checks passed; ${stats.length} model configurations`)
