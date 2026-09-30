import * as THREE from 'three'
import type { Structure } from '../core/types'
import type { GameMap } from '../world/mapgen'
import { l11Door, l11MetroRamp, l11Buildings, l11SurfaceAt, l11Axis, L11_USES, type L11Building } from '../world/l11Layout'
import { l11Material, type L11MaterialKind } from './l11Materials'
import { makeCanvasCtx, toTex } from './shared'

// Append directly to shared buffers: no per-window Mesh, BoxGeometry or collider allocations.
export class CityBatch {
  private buckets = new Map<THREE.Material, { p:number[]; n:number[]; uv:number[]; idx:number[] }>()
  quad(mat:THREE.Material, points:number[][], normal:number[], scale=1) {
    let b=this.buckets.get(mat)
    if(!b){b={p:[],n:[],uv:[],idx:[]};this.buckets.set(mat,b)}
    const start=b.p.length/3
    for(const v of points){b.p.push(...v);b.n.push(...normal);b.uv.push((Math.abs(normal[1])>.5?v[0]:v[0]+v[2])*scale,(Math.abs(normal[1])>.5?v[2]:v[1])*scale)}
    b.idx.push(start,start+1,start+2,start,start+2,start+3)
  }
  box(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number) {
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2
    this.quad(mat,[[a,c,g],[b,c,g],[b,e,g],[a,e,g]],[0,0,1])
    this.quad(mat,[[b,c,f],[a,c,f],[a,e,f],[b,e,f]],[0,0,-1])
    this.quad(mat,[[b,c,g],[b,c,f],[b,e,f],[b,e,g]],[1,0,0])
    this.quad(mat,[[a,c,f],[a,c,g],[a,e,g],[a,e,f]],[-1,0,0])
    this.quad(mat,[[a,e,g],[b,e,g],[b,e,f],[a,e,f]],[0,1,0])
    this.quad(mat,[[a,c,f],[b,c,f],[b,c,g],[a,c,g]],[0,-1,0])
  }
  finish(group:THREE.Group) {
    for(const [mat,b] of this.buckets){
      const geo=new THREE.BufferGeometry()
      geo.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3))
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geo.setIndex(b.idx);geo.computeBoundingSphere()
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;group.add(mesh)
    }
    this.buckets.clear()
  }
}

const signCache=new Map<string,THREE.Material>()
function sign(label:string) {
  let mat=signCache.get(label);if(mat)return mat
  const [c,ctx]=makeCanvasCtx(512,128)
  ctx.fillStyle='#253d3b';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e3e0c9';ctx.lineWidth=4;ctx.strokeRect(8,8,496,112)
  ctx.fillStyle='#e3e0c9';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,64,468)
  mat=new THREE.MeshStandardMaterial({map:toTex(c),roughness:.65,side:THREE.DoubleSide});mat.userData.shared=true;signCache.set(label,mat);return mat
}
function labelMesh(g:THREE.Group,label:string,x:number,y:number,z:number,w=3) {
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),sign(label));m.position.set(x,y,z);g.add(m)
}

export function* buildL11Building(s:Structure):Generator<void,THREE.Group,unknown> {
  const b=s.data as unknown as L11Building, w=s.w,d=s.h,H=b.floors*3
  const root=new THREE.Group(), near=new THREE.Group(), far=new THREE.Group(), a=new CityBatch()
  let complete=false
  try {
  const finish:L11MaterialKind[]=['plaster','concrete','brick','tile','plaster','metal']
  const wall=l11Material(finish[b.finish%6]), trim=l11Material('concrete','#d9dad3'), metal=l11Material('metal','#657171')
  const glass=l11Material(b.sealed?'sealedglass':'glass'), dark=l11Material('sealedglass')
  const door=l11Door(b), dx=door.x-b.x,dz=door.y-b.y
  const shellFloors=b.sealed?0:b.accessible
  // Genuine wall apertures, including the sill and lintel, use precisely the collision grid rule.
  for(let fl=0;fl<shellFloors;fl++){for(let z=0;z<d;z++)for(let x=0;x<w;x++){
    if(x!==0&&x!==w-1&&z!==0&&z!==d-1)continue
    const entry=fl===0&&x===dx&&z===dz
    const window=!entry&&((x>0&&x<w-1&&x%4===2)||(z>0&&z<d-1&&z%4===2))
    const px=x+.5,pz=z+.5,base=fl*3,vertical=x===0||x===w-1
    if(entry){a.box(wall,px,base+2.8,pz,1,.4,1);continue}
    if(!window){a.box(wall,px,base+1.5,pz,1,3,1);continue}
    a.box(wall,px,base+.45,pz,1,.9,1);a.box(wall,px,base+2.8,pz,1,.4,1)
    a.box(glass,px,base+1.75,pz,vertical?.035:.92,1.7,vertical?.92:.035)
    a.box(trim,px,base+.91,pz,vertical?1.08:1,.07,vertical?1:1.08)
    a.box(metal,px,base+1.75,pz,vertical?.08:.055,1.7,vertical?.055:.08)
    for(const k of [-.46,.46])a.box(metal,px+(vertical?0:k),base+1.75,pz+(vertical?k:0),.065,1.7,.065)
  }yield}
  // Closed upper stories have seven distinct silhouettes; recessed glazing is not a luminous panel.
  function* tower(x:number,z:number,tw:number,td:number,lo:number,hi:number,step=0):Generator<void,void,unknown>{
    for(let fl=lo;fl<hi;fl++){
      const inset=step?Math.floor((fl-lo)/5)*step:0,fw=Math.max(5,tw-inset*2),fd=Math.max(5,td-inset*2)
      a.box(wall,x,fl*3+1.5,z,fw,3,fd)
      a.box(trim,x,fl*3+.12,z,fw+.2,.22,fd+.2)
      for(const side of [-1,1]) {
        a.box(dark,x,fl*3+1.7,z+side*(fd/2+.012),fw-1.2,1.85,.035)
        a.box(dark,x+side*(fw/2+.012),fl*3+1.7,z,.035,1.85,fd-1.2)
        for(let q=-fw/2+.65;q<fw/2;q+=2.7)a.box(metal,x+q,fl*3+1.7,z+side*(fd/2+.075),.09,1.9,.13)
        for(let q=-fd/2+.65;q<fd/2;q+=2.7)a.box(metal,x+side*(fw/2+.075),fl*3+1.7,z+q,.13,1.9,.09)
      }
      if(b.style===4)for(const q of [-fw*.33,0,fw*.33])for(const side of [-1,1])a.box(trim,x+q,fl*3+1.5,z+side*fd/2,.45,3,.42)
      yield
    }
  }
  const lo=shellFloors, podium=Math.min(b.floors,Math.max(lo,2))
  if(lo<b.floors){
    yield* tower(w/2,d/2,w,d,lo,podium)
    switch(b.style){
      case 0: yield* tower(w/2,d/2,w*.79,d*.78,podium,b.floors);break
      case 1: yield* tower(w*.5,d*.5,w*.65,d*.8,podium,b.floors);break
      case 2: yield* tower(w/2,d/2,w,d,podium,b.floors,.9);break
      case 3: yield* tower(w*.27,d*.40,w*.40,d*.73,podium,b.floors);yield* tower(w*.76,d*.57,w*.36,d*.72,podium,Math.max(podium+1,b.floors-3));break
      case 4: yield* tower(w/2,d/2,w*.88,d*.88,podium,b.floors,.32);break
      case 5: yield* tower(w/2,d/2,w*.85,d*.85,podium,b.floors);a.box(metal,w*.5,H+1,d*.5,w*.55,2,d*.55);break
      default:yield* tower(w/2,d/2,w,d,podium,Math.min(b.floors,podium+4));yield* tower(w*.56,d*.52,w*.7,d*.72,Math.min(b.floors,podium+4),b.floors)
    }
  }
  if(shellFloors===b.floors)a.box(trim,w/2,H-.1,d/2,w+.22,.22,d+.22)
  a.box(metal,w*.5,H+.4,d*.5,2.1,.8,1.4);a.box(metal,w*.56,H+1.7,d*.5,.08,2.8,.08)
  if(b.sealed)a.box(trim,w/2,.13,d/2,w,.26,d)
  if(b.sealed){ // A recessed locked entrance, visually unlike the usable entrance doors.
    a.box(dark,dx+.5,1.25,dz+.5,b.front==='n'||b.front==='s'?1.5:.12,2.5,b.front==='n'||b.front==='s'?.12:1.5)
    a.box(metal,dx+.5,2.6,dz+.5,2.6,.18,1.5)
  }
  a.finish(near)
  yield
  // Proxy copies only the solid silhouette; generated once and selected by THREE.LOD, not by CPU traversal.
  const p=new CityBatch();p.box(wall,w/2,H/2,d/2,w,H,d)
  for(let fl=0;fl<b.floors;fl+=2)for(const side of [-1,1]){
    p.box(dark,w/2,fl*3+1.5,d/2+side*(d/2+.015),w-.8,1.8,.04)
    p.box(dark,w/2+side*(w/2+.015),fl*3+1.5,d/2,.04,1.8,d-.8)
  }
  p.finish(far)
  const lod=new THREE.LOD();lod.addLevel(near,0);lod.addLevel(far,135,.15);root.add(lod)
  if(!b.sealed){
    const signGroup=new THREE.Group()
    labelMesh(signGroup,L11_USES[b.use],0,2.72,0,2.6)
    signGroup.position.set(dx+.5,0,dz+.5)
    signGroup.rotation.y=b.front==='n'?Math.PI:b.front==='w'?-Math.PI/2:b.front==='e'?Math.PI/2:0
    signGroup.translateZ(.56);near.add(signGroup)
  }
  root.position.set(s.x,0,s.y);root.userData.noModelColliders=true
  complete=true;return root
  }finally{
    if(!complete)for(const group of [near,far])group.traverse(o=>(o as THREE.Mesh).geometry?.dispose())
  }
}

export function buildL11Structure(s:Structure):THREE.Group|null {
  if(s.kind==='l11building'){const job=buildL11Building(s);for(;;){const r=job.next();if(r.done)return r.value}}
  if(s.kind==='l11window'||s.kind==='l11stair')return null // apertures and continuous stair surfaces are batched with the building/terrain.
  const g=new THREE.Group(),b=new CityBatch(),wood=l11Material('wood'),stone=l11Material('concrete'),metal=l11Material('metal'),white=l11Material('paint','#d5d8d0')
  const prop=String(s.data?.prop??'')
  const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>b.box(m,x,y,z,w,h,d)
  const legs=(w:number,d:number,h=.72)=>{for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])box(metal,x,h/2,z,.075,h,.075)}
  if(s.kind==='l11landmark'){
    box(metal,0,1,0,.1,2,.1);b.finish(g)
    const site=String(s.data?.citySite)
    labelMesh(g,site==='capital'?'首都 · CAPITAL':site==='timesquare'?'新时代广场':site==='L9'?'LEVEL 9 · 郊区':site==='L10'?'LEVEL 10 · 乡间小路':'M.E.G. BETA →',0,2.05,.07,3)
  }else if(s.kind==='l11subway'){
    for(const x of [-1.55,1.55]){box(metal,x,1.2,0,.09,2.4,.09);box(metal,x,.9,2,.08,.08,6)}
    box(white,0,2.6,0,3.3,.16,1.7);b.finish(g);labelMesh(g,'METRO · 地下站台',0,2.4,-.1)
  }else if(s.kind==='l11partition'){
    box(l11Material('plaster'),0,1.5,0,s.w,3,s.h);b.finish(g)
  }else{
    switch(prop){
      case 'chair':legs(.52,.55,.44);box(wood,0,.46,0,.58,.08,.6);box(wood,0,.78,.24,.58,.58,.07);break
      case 'desk':legs(1.7,.8);box(wood,0,.76,0,1.8,.09,.9);box(metal,.3,1.02,.15,.62,.44,.07);box(metal,.3,.81,.1,.35,.06,.28);break
      case 'sofa':legs(2.2,.9,.2);box(l11Material('paint','#777f76'),0,.48,0,2.2,.56,.9);box(wood,0,.87,.37,2.3,.48,.16);for(const x of [-1.08,1.08])box(wood,x,.68,0,.18,.55,1);break
      case 'bed':legs(1.1,2,.3);box(wood,0,.34,0,1.15,.16,2);box(white,0,.49,0,1.08,.22,1.95);box(white,0,.66,.66,.85,.13,.45);break
      case 'shelf':for(let k=0;k<4;k++)box(wood,0,.18+k*.5,0,1.8,.06,.45);for(const x of [-.87,.87])box(wood,x,.98,0,.06,1.9,.48);for(let k=0;k<10;k++)box(l11Material('paint',k%2?'#697e80':'#957b61'),-.7+(k%5)*.3,.39+Math.floor(k/5)*.5,0,.19,.34,.25);break
      case 'sink':box(white,0,.55,0,.9,.9,.62);box(metal,0,1.04,.15,.07,.3,.07);box(metal,0,1.18,.07,.07,.06,.2);box(metal,0,1.01,0,.6,.02,.35);break
      case 'kitchen':box(wood,0,.45,0,2,.85,.7);box(white,0,.9,0,2.05,.07,.74);for(const x of [-.7,0,.7])box(metal,x,.66,-.37,.22,.04,.04);break
      case 'radiator':for(let k=0;k<11;k++)box(white,-.7+k*.14,.4,0,.07,.65,.13);break
      case 'lockedlift':box(metal,0,1.25,0,.95,2.5,.1);box(stone,0,2.6,0,1.15,.2,.3);break
      case 'bench':legs(1.8,.52,.4);for(let k=0;k<4;k++)box(wood,0,.46,-.23+k*.15,1.8,.065,.12);box(wood,0,.78,.24,1.8,.45,.07);break
      case 'bin':box(l11Material('metal',['#525c56','#7c6855','#747d83'][Number(s.data?.style??0)%3]),0,.48,0,.55,.92,.55);box(white,0,.97,0,.6,.06,.6);break
      case 'tree':{
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,3.5,7),wood);trunk.position.y=1.75;g.add(trunk)
        for(let k=0;k<3;k++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6,1),l11Material('grass'));crown.position.set((k-1)*.7,3.5+k*.5,(k%2)*.6);g.add(crown)}break
      }
      case 'market':legs(2.6,1.3);box(wood,0,.8,0,2.8,.12,1.5);for(const x of [-1.3,1.3])box(metal,x,1.5,0,.06,3,.06);box(l11Material('paint','#8a7762'),0,2.8,0,3.1,.12,2);break
      case 'memorial':box(stone,0,.2,0,4,.4,2);box(stone,0,1.4,0,1.5,2.2,.9);break
      case 'betagate':box(stone,-5,2.5,0,5,5,7);box(stone,5,2.5,0,5,5,7);box(metal,0,4.7,0,15,.3,2);break
      case 'exhibit':box(stone,0,.45,0,1,.9,1);box(metal,0,1.5,0,.12,1.4,.12);break
      case 'anomaly':box(wood,0,1.05,0,.75,2.1,.6);box(l11Material('sealedglass'),0,1.45,-.315,.62,.8,.04);box(metal,0,.08,-.8,1.5,.15,.12);break
      default:box(stone,0,.4,0,s.w,.8,s.h)
    }
    b.finish(g)
    if(prop==='lockedlift')labelMesh(g,'上层暂停开放',0,2.25,-.08,.9)
    if(prop==='anomaly')labelMesh(g,'未确认异常 · 勿触碰',0,2.4,-.34,1.4)
  }
  g.position.set(s.x+s.w/2,0,s.kind==='l11subway'?s.y:s.y+s.h/2);return g
}

export function buildL11Terrain(m:GameMap,g:THREE.Group,r?:{x0:number;y0:number;x1:number;y1:number},closedWalls=false) {
  const job=buildL11TerrainJob(m,g,r,closedWalls);while(!job.next().done){/* finite/headless entry */}
}
export function* buildL11TerrainJob(m:GameMap,g:THREE.Group,r?:{x0:number;y0:number;x1:number;y1:number},closedWalls=false):Generator<void,void,unknown> {
  const a=new CityBatch(), tile=l11Material('tile'),wall=l11Material('concrete'),paint=l11Material('paint','#d9d7b7')
  const mats:Record<number,THREE.Material>={51:l11Material('asphalt'),52:wall,53:tile,54:l11Material('grass'),55:wall,56:tile,57:l11Material('wood'),58:tile}
  const surface=(mat:THREE.Material,x:number,y:number,z:number,h=0)=>a.quad(mat,[[x,y,z+1],[x+1,y+h,z+1],[x+1,y+h,z],[x,y,z]],[0,1,0])
  for(let z=r?.y0??0;z<(r?.y1??m.h);z++){for(let x=r?.x0??0;x<(r?.x1??m.w);x++){
    const i=z*m.w+x,wx=x+(m.inf?.ox??0),wz=z+(m.inf?.oy??0),st=m.stair[i]
    if(closedWalls){
      if(m.tiles[i]===2)a.box(l11Material('plaster'),x+.5,1.5,z+.5,1,3,1)
      if(m.upWall[i]===1)a.box(l11Material('plaster'),x+.5,4.5,z+.5,1,3,1)
      if(m.outdoor[i]===0&&(m.tiles[i]===1||m.tiles[i]===2))a.box(wall,x+.5,m.up[i]?6:3,z+.5,1,.18,1)
    }
    if(m.tiles[i]===1){
      let y=m.liquid[i]===1?-(m.seaFloor[i]||2.6):0
      if(st){const lo=((st>>>3)&0x3fff)/100,hi=((st>>>17)&0x3fff)/100;for(let k=0;k<3;k++)a.box(wall,x+.5,lo+(hi-lo)*(k+1)/3-.055,z+(k+.5)/3,1,.11,1/3)}
      else if(m.tint[i]!==58)surface(mats[m.tint[i]]??tile,x,y,z)
      else {const h=l11MetroRamp(wx+.5,wz+.5);if(h!==null)for(let k=0;k<3;k++)a.box(tile,x+.5,h+.25-(k+1)/6-.05,z+(k+.5)/3,1,.1,1/3);else surface(tile,x,0,z)}
      if(m.tint[i]===51){
        const road=l11SurfaceAt(m.inf?.seed??0,wx+.5,wz+.5),ax=l11Axis(wx+.5),az=l11Axis(wz+.5)
        const axis=road.roadX?az:ax,along=road.roadX?wx:wz
        if(Math.floor(axis.road)===(road.roadX?wz:wx)&&((along%8+8)%8)<4){
          a.box(paint,road.roadX?x+.5:axis.road-(m.inf?.ox??0),.009,road.roadX?axis.road-(m.inf?.oy??0):z+.5,road.roadX?1:.12,.012,road.roadX?.12:1)
        }
        if(road.crosswalk)a.box(paint,x+.5,.01,z+.5,road.roadX?.8:1,.012,road.roadX?1:.8)
      }
      if(m.liquid[i]===1)for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=(z+dz)*m.w+x+dx;if(j>=0&&j<m.tiles.length&&m.liquid[j]!==1)a.box(wall,x+.5+dx*.48,y/2,z+.5+dz*.48,dx?.08:1,-y,dz?.08:1)}
    }
    if(m.up[i]===1&&!st){surface(mats[m.tint[i]]??tile,x,3,z);a.box(wall,x+.5,2.9,z+.5,1,.15,1)}
    if(m.up2[i]===1&&(!st||((st>>>3)&0x3fff)<300)){surface(tile,x,6,z);a.box(wall,x+.5,5.9,z+.5,1,.15,1)}
    if(m.dn[i]===1){surface(tile,x,-5,z);if(m.tint[i]!==58)a.box(wall,x+.5,-1.98,z+.5,1,.12,1)
      const railX=((wx-16)%512+512)%512
      if(railX===1||railX===511)a.box(l11Material('metal'),x+.5,-4.94,z+.5,.1,.12,1)
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=(z+dz)*m.w+x+dx;if(j>=0&&j<m.tiles.length&&!m.dn[j])a.box(wall,x+.5+dx*.48,-3.5,z+.5+dz*.48,dx?.08:1,3,dz?.08:1)}
    }
  }yield}
  a.finish(g)
}

/** Real, world-anchored low-detail geometry outside the loaded simulation window (not a sky image). */
export function* buildL11DistantCity(seed:number,ox:number,oy:number):Generator<void,THREE.Group,unknown>{
  const group=new THREE.Group(),batch=new CityBatch(),concrete=l11Material('concrete'),dark=l11Material('sealedglass')
  let complete=false
  try {
    const inWindow=(x:number,y:number,w=0,h=0)=>x+w>ox&&x<ox+160&&y+h>oy&&y<oy+160
    for(let y=oy-432;y<oy+592;y+=16){
      for(let x=ox-432;x<ox+592;x+=16){
        if(inWindow(x,y,16,16)||Math.hypot(x-ox-80,y-oy-80)>510)continue
        const kind=l11SurfaceAt(seed,x+8,y+8).kind,mat=l11Material(kind==='road'||kind==='bridge'?'asphalt':kind==='grass'?'grass':'concrete')
        batch.quad(mat,[[x-ox,-.035,y-oy+16],[x-ox+16,-.035,y-oy+16],[x-ox+16,-.035,y-oy],[x-ox,-.035,y-oy]],[0,1,0])
      }
      yield
    }
    for(const b of l11Buildings(seed,ox-432,oy-432,ox+592,oy+592)){
      if(inWindow(b.x,b.y,b.w,b.h)||Math.hypot(b.x-ox-80,b.y-oy-80)>500)continue
      const x=b.x-ox+b.w/2,z=b.y-oy+b.h/2,H=b.floors*3
      batch.box(concrete,x,3,z,b.w,6,b.h)
      const tower=(tx:number,tz:number,w:number,d:number,base:number,top:number)=>{
        if(top<=base)return
        batch.box(concrete,tx,(base+top)/2,tz,w,top-base,d)
        for(let k=base+1.5;k<top;k+=6)for(const side of [-1,1]){
          batch.box(dark,tx,k,tz+side*(d/2+.02),w-.5,1.8,.05)
          batch.box(dark,tx+side*(w/2+.02),k,tz,.05,1.8,d-.5)
        }
      }
      if(b.style===3){tower(x-b.w*.23,z-b.h*.1,b.w*.4,b.h*.72,6,H);tower(x+b.w*.26,z+b.h*.06,b.w*.36,b.h*.7,6,H-9)}
      else if(b.style===2||b.style===4){tower(x,z,b.w*.9,b.h*.9,6,H*.6);tower(x,z,b.w*.68,b.h*.68,H*.6,H)}
      else tower(x,z,b.w*(b.style===1?.65:.8),b.h*.8,6,H)
      yield
    }
    batch.finish(group);group.name='l11-distant-world-geometry';group.userData.ox=ox;group.userData.oy=oy
    complete=true;return group
  }finally{if(!complete)group.traverse(o=>(o as THREE.Mesh).geometry?.dispose())}
}
