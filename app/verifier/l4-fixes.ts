import {look} from '../src/game/renderer/shared'
import {canOccupy} from '../src/game/core/player'
import type {Engine} from '../src/game/engine'
import type {Structure} from '../src/game/core/types'
import {buildL4OldStairs} from '../src/game/renderer/l4OldStairs'
import {buildL4WallDecor} from '../src/game/renderer/l4WallDecor'
import * as THREE from 'three'
import {buildL4Terrain} from '../src/game/renderer/l4Terrain'
import {genL4ChunkRaw} from '../src/game/world/infiniteL4'
import {l4VoidAt} from '../src/game/world/l4Layout'

export function verifyL4Fixes(eng:Engine){
  const map=eng.map!,player={...eng.player},savedLook={...look},onStairs=eng.onStairs,takeExit=eng.takeExit,target=eng.interactTarget
  let checks=0,exits=0
  const assert=(v:unknown,msg:string)=>{if(!v)throw new Error(msg);checks++}
  const m={...map,inf:undefined,structures:[] as Structure[],items:[],entities:[],exits:[],npcs:[],zones:[]}
  m.tiles=new Uint8Array(m.w*m.h).fill(1);m.elev=new Uint8Array(m.w*m.h);m.tint=new Uint8Array(m.w*m.h).fill(51);m.stair=new Int32Array(m.w*m.h);m.outdoor=new Uint8Array(m.w*m.h)
  const aim=(s:Structure,x:number,y:number)=>{
    eng.player.x=x;eng.player.y=y;eng.player.z=0;eng.player.floor=0
    const dx=s.x+.5-x,dy=s.y+.5-y;eng.player.facing=Math.atan2(dy,dx);look.yaw=Math.atan2(-dx,-dy);look.pitch=0;look.visualHit=null
    eng.scanInteract()
  }
  try{
    eng.map=m
    const glass:Structure={kind:'glasswin',x:20,y:20,w:1,h:1,solid:true,data:{l4:1,partition:1}}
    m.structures=[glass];aim(glass,20.5,21.5)
    assert(eng.interactTarget===null,'interior partition has no outside-view prompt')
    glass.data={l4:1,coast:1,deg:0};aim(glass,20.5,19.5)
    assert(eng.interactTarget?.kind==='glasswin','real exterior window retains view interaction')
    for(const axis of ['x','y']){
      const s:Structure={kind:'glassdoor',x:20,y:20,w:1,h:1,solid:true,data:{l4:1,axis,open:0}}
      m.structures=[s];const dx=axis==='y'?1:0,dy=dx?0:1
      aim(s,20.5+dx*.8,20.5+dy*.8);assert(eng.interactTarget?.s===s,'glass door targeted')
      eng.doInteract();assert(s.data?.open===1&&!s.solid,'E opens glass door')
      aim(s,20.5+dx*.10,20.5+dy*.10);eng.doInteract()
      assert(s.data?.open===1&&!s.solid,'closing while in doorway is rejected')
      assert(canOccupy(m,eng.player.x,eng.player.y),'rejected close leaves player free')
      aim(s,20.5+dx*.8,20.5+dy*.8);eng.doInteract()
      assert(!s.data?.open&&s.solid,'closing from a clear position succeeds')
    }
    const old=eng.levelDef.exits.find(e=>e.kind==='oldstairs')!
    m.exits=[{def:old,x:30,y:30,discovered:false}] as typeof map.exits
    m.structures=[];m.tiles[31*m.w+30]=2;m.tint[30*m.w+30]=52
    for(let n=1;n<=3;n++){m.elev[(30-n)*m.w+30]=4;m.structures.push({kind:'stairrail',x:30,y:30-n,w:1,h:1,solid:true,data:{l4:1,deg:0,end:n===3?1:0}})}
    eng.takeExit=()=>{exits++}
    for(const [s,z]of [[.25,0],[.65,-.184615],[2.5,-2.461538]]){
      eng.player.x=30.5;eng.player.y=30.5-s;eng.player.z=0
      for(let i=0;i<30;i++)eng.updateStairs(1/60)
      assert(Math.abs(eng.player.z-z)<.006,'stair descent starts at physical hole edge')
    }
    eng.player.y=30.5-2.95;eng.updateStairs(1/60);assert(exits===1,'classical stairs still reach Level 5')
    const g=buildL4OldStairs();g.updateMatrixWorld(true)
    const treads=g.children.filter(o=>o.name==='l4-oldstairs-tread')
    assert(treads.length===13,'complete thirteen-tread flight')
    for(const o of treads){const b=new THREE.Box3().setFromObject(o);assert(b.max.z<=-.497&&b.min.z>=-3.5&&b.min.x>=-.5&&b.max.x<=.5,'tread fits floor opening')}
    g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()})
    for(let i=0;i<3;i++){
      const board=buildL4WallDecor(i),b=new THREE.Box3().setFromObject(board)
      assert(board.children.length===5,'wall decor has bounded five-mesh cost')
      assert(b.min.z>=-1e-6&&b.max.z<=.046&&b.max.x-b.min.x<=1.5,'wall decorations are thin and contained')
      board.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()})
    }
    return {checks,doorAxes:2,oldStairExit:exits}
  }finally{
    eng.map=map;Object.assign(eng.player,player);Object.assign(look,savedLook);eng.onStairs=onStairs;eng.takeExit=takeExit;eng.interactTarget=target
  }
}

export function verifyL4Corners(eng:Engine){
  const seed=eng.map!.inf!.seed;let vx=0,vy=0,checks=0
  outer:for(let y=0;y<100;y++)for(let x=0;x<100;x++)if(l4VoidAt(seed,x,y)&&!l4VoidAt(seed,x-1,y)&&!l4VoidAt(seed,x,y-1)){vx=x;vy=y;break outer}
  const assert=(v:unknown,msg:string)=>{if(!v)throw new Error(msg);checks++}
  const cache=new Map<string,ReturnType<typeof genL4ChunkRaw>>()
  for(const [dx,dy]of [[0,0],[40,0],[0,40],[40,40]]){
    const origin={x:vx+dx-4,y:vy+dy-4}
    const make=(w:number)=>{
      const m={...eng.map!,w,h:w,structures:[],inf:{...eng.map!.inf!,ox:origin.x,oy:origin.y}}
      m.tiles=new Uint8Array(w*w);m.tint=new Uint8Array(w*w);m.outdoor=new Uint8Array(w*w);m.elev=new Uint8Array(w*w)
      for(let y=0;y<w;y++)for(let x=0;x<w;x++){
        const wx=origin.x+x,wy=origin.y+y,cx=Math.floor(wx/32),cy=Math.floor(wy/32),key=cx+':'+cy
        let c=cache.get(key);if(!c){c=genL4ChunkRaw(eng.levelDef,seed,cx,cy);cache.set(key,c)}
        const j=(wy-cy*32)*32+wx-cx*32,i=y*w+x;m.tiles[i]=c.tiles[j];m.tint[i]=c.tint[j];m.outdoor[i]=c.outdoor[j];m.elev[i]=c.elev[j]
      }
      return m
    }
    const full=make(8),clipped=make(4),a=new THREE.Group(),b=new THREE.Group()
    buildL4Terrain(full,a,{x0:3,x1:4,y0:3,y1:4});buildL4Terrain(clipped,b,{x0:3,x1:4,y0:3,y1:4})
    const pier=(g:THREE.Group)=>g.children.find(o=>new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y>300) as THREE.Mesh
    assert(!!pier(a)&&!!pier(b),'corner stays sealed at streaming window edge')
    assert(new THREE.Box3().setFromObject(pier(a)).equals(new THREE.Box3().setFromObject(pier(b))),'same world corner bounds with or without neighbour data')
    const left=new THREE.Group(),right=new THREE.Group()
    buildL4Terrain(full,left,{x0:0,x1:4,y0:0,y1:8});buildL4Terrain(full,right,{x0:4,x1:8,y0:0,y1:8})
    const count=[left,right].filter(g=>g.children.some(o=>{const box=new THREE.Box3().setFromObject(o);return box.getSize(new THREE.Vector3()).y>300&&box.getSize(new THREE.Vector3()).x<.3&&box.getSize(new THREE.Vector3()).z<.3})).length
    assert(count===1,'corner pier has one owner across a chunk split')
    for(const g of [a,b,left,right])g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()})
  }
  return{checks,corners:4,voidOrigin:[vx,vy]}
}
