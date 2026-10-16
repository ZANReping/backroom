import type * as THREE from 'three'
import type { L11Building, L11Volume } from '../world/l11Types'
import { l11Archetype } from '../content/l11Buildings'
import { l11Material } from './l11Materials'
import { CityBatch } from './l11Batch'

/** Roof furniture is batched with its own building and removed with its LOD.
 * Slopes, dormers, parapets and mechanical screens carry real depth, not decals. */
export function l11RoofDetails(a:CityBatch,b:L11Building,v:L11Volume,detail:number,m:{metal:THREE.Material;trim:THREE.Material;wall:THREE.Material;dark:THREE.Material}){
  const H=v.hi,spec=l11Archetype(b.archetype),flat=!v.shape||v.shape==='round'
  const free=(x:number,z:number,pad=1)=>x>v.x+pad&&x<v.x+v.w-pad&&z>v.y+pad&&z<v.y+v.d-pad&&!b.volumes.some(q=>q!==v&&q.lo>=H-.01&&q.hi>H&&x>q.x-pad&&x<q.x+q.w+pad&&z>q.y-pad&&z<q.y+q.d+pad)
  if(v.shape==='gable'){
    // Deep eaves and a capped ridge keep the three-to-seven-storey residential
    // silhouettes distinct from flat commercial podiums.
    a.box(m.metal,v.x+v.w/2,H+2.03,v.y+v.d/2,v.w+.55,.14,.25)
    for(const z of [v.y-.18,v.y+v.d+.18])a.box(m.metal,v.x+v.w/2,H-.08,z,v.w+.6,.18,.22)
    if(detail<2&&spec.group==='residential'&&v.w>8){
      for(const x of [v.x+v.w*.28,v.x+v.w*.72]){
        const z=v.y+v.d*.22,base=H+.88
        a.box(m.wall,x,base+.55,z,1.7,1.1,1.6);a.box(m.dark,x,base+.6,z-.81,1.35,.74,.025)
        a.box(m.trim,x,base+1.15,z,1.9,.14,1.8);a.box(m.trim,x,base+.6,z-.84,.06,.76,.04)
      }
    }
    if(!detail)for(let x=v.x+.9;x<v.x+v.w;x+=1.25)for(const side of [-1,1]){
      const end=v.y+v.d/2+side*(v.d/2+.2)
      a.quad(m.trim,[[x,H+2.03,v.y+v.d/2],[x+.028,H+2.03,v.y+v.d/2],[x+.028,H+.015,end],[x,H+.015,end]],[0,1,0])
    }
  }else if(v.shape==='barrel'){
    if(detail<2)for(let x=v.x+.8;x<v.x+v.w;x+=3)for(let k=0;k<8;k++){
      const z0=v.y+v.d*k/8,z1=v.y+v.d*(k+1)/8,h0=H+Math.sin(k*Math.PI/8)*2+.035,h1=H+Math.sin((k+1)*Math.PI/8)*2+.035
      a.quad(m.trim,[[x,h0,z0],[x+.08,h0,z0],[x+.08,h1,z1],[x,h1,z1]],[0,1,0])
    }
  }else if(v.shape==='sawtooth'){
    if(detail<2)for(let z=v.y+v.d/Math.max(2,Math.floor(v.d/5));z<=v.y+v.d+.01;z+=v.d/Math.max(2,Math.floor(v.d/5)))for(let x=v.x+.5;x<v.x+v.w;x+=2.5)a.box(m.metal,x,H+.8,z+.035,.065,1.6,.1)
  }
  if(!flat||detail===2)return
  const x=v.x+v.w*.5,z=v.y+v.d*.5
  if(free(x,z,2)){
    if(['museum','archive','transit-station','supermarket'].includes(b.archetype)){
      const w=Math.min(7,v.w*.46),d=Math.min(5,v.d*.38),glass=l11Material('sealedglass','#527880')
      a.box(m.metal,x,H+.18,z,w+.2,.32,d+.2)
      for(const side of [-1,1])a.quad(glass,[[x-w/2,H+.35,z+side*d/2],[x+w/2,H+.35,z+side*d/2],[x+w/2,H+1.7,z],[x-w/2,H+1.7,z]],[0,1,0])
      a.box(m.trim,x,H+1.7,z,w,.1,.12)
      if(!detail)for(let xx=x-w/2;xx<=x+w/2;xx+=1.2)for(const side of [-1,1])a.quad(m.metal,[[xx,H+.38,z+side*d/2],[xx+.05,H+.38,z+side*d/2],[xx+.05,H+1.73,z],[xx,H+1.73,z]],[0,1,0])
    }else{
      // Ventilated lift overrun and acoustic plant screen. Equipment is hidden
      // beneath the screen at street level and visible from high viewpoints.
      a.box(m.wall,x,H+.8,z,3.4,1.6,2.5);a.box(m.trim,x,H+1.65,z,3.7,.14,2.8)
      if(!detail)for(let k=0;k<6;k++)a.box(m.metal,x,H+.3+k*.2,z-1.27,2.9,.07,.035)
    }
  }
  if(spec.group==='office'&&H===Math.max(...b.volumes.map(v=>v.hi))){
    for(const zz of [v.y+.18,v.y+v.d-.18])a.box(m.metal,v.x+v.w/2,H+.72,zz,v.w,.07,.08)
    if(!detail)for(let xx=v.x+.6;xx<v.x+v.w;xx+=1.5)for(const zz of [v.y+.18,v.y+v.d-.18])a.box(m.trim,xx,H+.35,zz,.12,.7,.2)
  }
  if(detail)return
  // Setback terraces and lower urban blocks have gardens/pergolas. The upper
  // volume exclusion prevents equipment or planting from piercing a tower.
  const terrace=spec.group==='residential'||b.archetype==='setback-office'||b.archetype==='hotel'||b.archetype==='court-shops'
  for(const [u,t]of [[.18,.22],[.82,.78]]){
    const px=v.x+v.w*u,pz=v.y+v.d*t
    if(!free(px,pz,1.4))continue
    if(terrace){a.box(l11Material('concrete','#b9b6a8'),px,H+.23,pz,2.2,.46,.8);a.box(l11Material('grass','#a3b994'),px,H+.6,pz,1.95,.4,.6)}
    else{a.box(m.metal,px,H+.4,pz,2.3,.8,1.3);for(let i=0;i<7;i++)a.box(m.dark,px-1+i*.32,H+.82,pz,.14,.03,.9)}
  }
  const px=v.x+v.w*.75,pz=v.y+v.d*.25
  if(terrace&&free(px,pz,2)){
    for(const dx of [-1.3,1.3])for(const dz of [-1,1])a.box(m.metal,px+dx,H+1.1,pz+dz,.085,2.2,.085)
    for(let dx=-1.45;dx<=1.5;dx+=.32)a.box(l11Material('propwood','#bdaf96'),px+dx,H+2.25,pz,.12,.12,2.5)
  }
}
