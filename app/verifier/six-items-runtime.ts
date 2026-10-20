import * as THREE from 'three'
import { Engine } from '../src/game/engine'
import { look } from '../src/game/renderer'
import { audio } from '../src/game/core/audio'
import { updateItemUse } from '../src/game/engine/inventory'
import { SIX_ITEM_TYPES } from '../src/game/renderer/sixItemMesh'
import { RemotePlayerViews } from '../src/game/renderer/remotePlayers'
import type { GameMap } from '../src/game/world/mapgen'
import type { MpRemotePlayer, MpSession } from '../src/game/net/session'

/** Isolated Engine + actual inventory/interaction/projectile/remote-renderer paths.
 * Does not start a run, write a save, contact peers or mutate the active game.
 */
export function verifySixItemRuntime() {
  const savedLook={...look},savedSong=audio.onSongPlayed,savedEnd=audio.onOneshotEnd
  const results:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);results.push(label)}
  const e=new Engine(),p=e.player,z=()=>new Uint8Array(64)
  e.map={w:8,h:8,tiles:new Uint8Array(64).fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:4,y:4},
    wet:z(),elev:z(),outdoor:z(),step:z(),crawl:z(),ceiling:z(),up:z(),upWall:z(),up2:z(),upWall2:z(),stair:new Int32Array(64),
    liquid:z(),seaFloor:new Float32Array(64),floors:1,dn:z(),dnWall:z(),tint:z()} satisfies GameMap
  Object.assign(p,{x:4,y:4,z:0,floor:0,level:4})
  p.hotbar.fill(null);p.backpack.fill(null)
  try{
    for(const type of SIX_ITEM_TYPES){
      p.hotbar[0]={type,count:1};p.selected=0;e.dropSlot('hotbar',0)
      const item=e.map.items.at(-1)!
      check(item.type===type&&item.count===1&&!p.hotbar[0],`${type}: drop preserves ID/count`)
      const dx=item.x-p.x,dy=item.y-p.y,dz=.22-1.55
      Object.assign(look,{visualHit:null,yaw:Math.atan2(-dx,-dy),pitch:Math.atan2(dz,Math.hypot(dx,dy)),rayX:dx,rayY:dy,rayZ:dz})
      e.scanInteract();check(e.interactTarget?.it===item,`${type}: pickup reticle targets dropped model`)
      e.doInteract();check(e.countItem(type)===1&&!e.map.items.includes(item),`${type}: E pickup returns one item`)
      p.hotbar.fill(null);p.backpack.fill(null)
    }
    p.hotbar[0]={type:'luckymilk',count:1};Object.assign(p,{sanity:20,hunger:20,thirst:20})
    check(e.useSlot('hotbar',0),'milk: timed drinking starts')
    updateItemUse(e,.1);check(e.countItem('luckymilk')===1&&p.sanity===20,'milk: no premature consumption')
    updateItemUse(e,10);check(e.countItem('luckymilk')===0&&p.sanity===60&&p.hunger===40&&p.thirst===50,'milk: original +40/+20/+30 settlement')
    p.hotbar[0]={type:'capacitor',count:1};p.selected=0;look.rayX=1;look.rayY=0;look.rayZ=0
    e.throwHeld('capacitor');const projectile=e.projectiles.at(-1)!
    check(projectile?.type==='capacitor'&&!p.hotbar[0]&&Math.abs(Math.hypot(projectile.vx,projectile.vy,projectile.vz)-9)<1e-6,'lightning: consumed once, projectile retains type and speed')
    for(const type of ['rabbit','skeleton','pockets','fuyouyu']){
      p.hotbar[0]={type,count:1};check(e.equipItem('hotbar',0)&&e.hasPocket(type),`${type}: original pocket equipment slot`)
    }
    check(p.hasRabbit&&p.hasPockets&&p.backpack.length===20,'charms: rabbit flag and Pockets +4 retained')
    const index=p.equip.pockets.findIndex(s=>s?.type==='pockets');e.unequipSlot('pocket',index)
    check(!p.hasPockets&&p.backpack.length===16,'Pockets: removing charm restores capacity')

    const scene=new THREE.Scene(),views=new RemotePlayerViews()
    const remote={id:'six-verifier-peer',idn:{name:'Verifier',avatar:{}},lastSeen:Date.now(),s:{x:4,y:5,z:0,yaw:0,pitch:0,level:4,held:null,iso:false,dead:false}} as unknown as MpRemotePlayer
    const session={started:true,isHost:true,remotes:new Map([[remote.id,remote]])} as unknown as MpSession
    let previous:THREE.Object3D|undefined,disposeCount=0,expected=0,textureDisposals=0
    for(let cycle=0;cycle<6;cycle++)for(const [i,type]of SIX_ITEM_TYPES.entries()){
      p.hotbar[i]={type,count:1};p.selected=i
      remote.s.held=p.hotbar[p.selected]!.type;remote.lastSeen=Date.now()
      views.update(scene,e,session,cycle,.016)
      check(disposeCount===expected,`${cycle}/${type}: previous remote model fully released`)
      previous=undefined;scene.traverse(o=>{if(o.userData.sixItemModel)previous=o})
      check(previous?.name===`${type}-detailed-model`,`${cycle}/${type}: selected hotbar ID reaches remote hand`)
      previous!.traverse(o=>{if(o instanceof THREE.Mesh){
        expected+=2;o.geometry.addEventListener('dispose',()=>disposeCount++)
        const mat=o.material as THREE.MeshStandardMaterial;mat.addEventListener('dispose',()=>disposeCount++)
        mat.map?.addEventListener('dispose',()=>textureDisposals++)
      }})
    }
    session.remotes.clear();views.update(scene,e,session,10,.016)
    check(disposeCount===expected&&scene.children.length===0,'remote departure releases final held model')
    check(textureDisposals===0,'remote switching/departure preserves shared atlas textures')
    return {passed:results.length,results,scope:'isolated engine + synthetic remote session; no live peer connection'}
  }finally{Object.assign(look,savedLook);audio.onSongPlayed=savedSong;audio.onOneshotEnd=savedEnd}
}
