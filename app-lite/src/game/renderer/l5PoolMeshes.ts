import * as THREE from 'three'
import type { Structure } from '../core/types'
import { l5Material, type L5Surface } from './l5Materials'
import { makeCanvasCtx, toTex } from './shared'

const mesh=(g:THREE.Group,geo:THREE.BufferGeometry,s:L5Surface|THREE.Material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,typeof s==='string'?l5Material(s):s);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m}
const safetyRed=new THREE.MeshLambertMaterial({color:'#c64b3f'})
const box=(g:THREE.Group,w:number,h:number,d:number,s:L5Surface,x=0,y=0,z=0)=>mesh(g,new THREE.BoxGeometry(w,h,d),s,x,y,z)
const tube=(g:THREE.Group,points:THREE.Vector3[],radius:number,s:L5Surface)=>{const curve=new THREE.CatmullRomCurve3(points),geo=new THREE.TubeGeometry(curve,12, radius,10,false);mesh(g,geo,s);for(const t of [0,1]){const p=curve.getPoint(t),n=curve.getTangent(t).multiplyScalar(t?1:-1);const cap=mesh(g,new THREE.CircleGeometry(radius,10),s,p.x,p.y,p.z);cap.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n)}}
const labelCache=new Map<string,THREE.Material>()
function label(text:string){let m=labelCache.get(text);if(m)return m;const[c,ctx]=makeCanvasCtx(512,128);ctx.fillStyle='#334238';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e1d8b4';ctx.lineWidth=5;ctx.strokeRect(7,7,498,114);ctx.font='bold 31px sans-serif';ctx.fillStyle='#f3ead1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,67,480);m=new THREE.MeshLambertMaterial({map:toTex(c)});labelCache.set(text,m);return m}
function finish(g:THREE.Group,kind:string){g.userData.poolDecor=kind;return g}

export function buildL5PoolStructure(s:Structure):THREE.Group|null{
  if(s.data?.l5!==1)return null
  const g=new THREE.Group()
  if(s.kind==='poolladder'){
    for(const x of [-.275,.275])tube(g,[new THREE.Vector3(x,.0,.18),new THREE.Vector3(x,.85,.18),new THREE.Vector3(x,.85,-.18),new THREE.Vector3(x,.18,-.72),new THREE.Vector3(x,-1.4,-.72)],.035,'steel')
    for(const y of [-.25,-.6,-.95,-1.3]){box(g,.48,.045,.12,'blackSteel',0,y,-.65);for(const x of [-.17,0,.17])box(g,.018,.012,.10,'steel',x,y+.03,-.65)}
    for(const x of [-.275,.275])mesh(g,new THREE.CylinderGeometry(.075,.075,.04,12),'steel',x,.02,.18);return finish(g,'poolladder')
  }
  if(s.kind==='divingboard'){
    for(const x of [-.22,.22])box(g,.07,.35,.07,'steel',x,.175,.22)
    box(g,.6,.065,1.7,'linen',0,.38,-.55)
    for(let i=0;i<6;i++)box(g,.018,.012,1.62,'gold',-.24+i*.096,.418,-.55)
    return finish(g,'divingboard')
  }
  if(s.kind==='bench'){
    for(let i=0;i<4;i++)box(g,.30,.07,.45,'wood',-.48+i*.32,.44,0)
    for(const x of [-.48,.48]){box(g,.06,.40,.06,'blackSteel',x,.20,-.16);box(g,.06,.40,.06,'blackSteel',x,.20,.16);box(g,.12,.06,.42,'blackSteel',x,.05,0)}
    for(const x of [-.22,.22])box(g,.36,.035,.20,'linen',x,.515,0)
    return finish(g,'bench')
  }
  if(s.kind==='ceilingbeam'&&s.data?.profile==='poolSafety'){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.065,8,20),new THREE.MeshLambertMaterial({color:'#f0ead8'}));ring.position.set(0,1.3,0);ring.castShadow=true;g.add(ring)
    for(let i=0;i<4;i++){const arc=new THREE.Mesh(new THREE.TorusGeometry(.27,.068,8,20,Math.PI/7),safetyRed);arc.rotation.z=i*Math.PI/2;arc.position.set(0,1.3,0);arc.castShadow=true;arc.receiveShadow=true;g.add(arc)}
    tube(g,[new THREE.Vector3(.4,.65,0),new THREE.Vector3(.4,1.35,0)],.018,'steel');box(g,.08,.11,.08,'gold',.4,.62,0);mesh(g,new THREE.PlaneGeometry(.72,.18),label('水深 1.7 m / 禁止跳水'),0,.98,.04)
    return finish(g,'poolSafety')
  }
  return null
}
