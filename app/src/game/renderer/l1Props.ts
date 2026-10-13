import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Structure } from '../core/types'
import { getMaterialMode,litMaterial } from './shared'
import {l1Texture} from './l1Materials'
import {L1_CRATE,l1CrateCount} from '../world/l1Crate'

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material }
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cyl = (r: number, h: number, n = 8) => new THREE.CylinderGeometry(r, r, h, n)
function cushion(w:number,h:number,d:number,r=.07){
  const s=new THREE.Shape(),x=-w/2,y=-h/2
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r)
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r)
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y)
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelThickness:.015,bevelSize:.015,bevelSegments:1,steps:1,curveSegments:2})
  g.translate(0,0,-d/2);return g
}
const mat = (color: string, metalness = 0, roughness = .82) => {
  const m = litMaterial({ color, metalness, roughness, envBase: .12 })
  m.userData.l1Owned = true
  return m
}
function add(g: THREE.Group, parts: Part[]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const p of parts) { const a = by.get(p.mat) ?? []; a.push(p.geo); by.set(p.mat, a) }
  for (const [m, gs] of by) { const merged = mergeGeometries(gs, false); if (merged) g.add(new THREE.Mesh(merged, m)) ; gs.forEach(x => x.dispose()) }
}
function p(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0): Part {
  geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z); return { geo, mat: m }
}

function foldingtable() {
  const g = new THREE.Group(), top = mat('#b1b2aa'), iron = mat('#3f4544', .55, .5), a: Part[] = [p(box(1.55, .04, .72), top, 0, .74, 0)]
  for (const x of [-.57, .57]) for (const z of [-.22, .22]) a.push(p(box(.025, .7, .025), iron, x, .38, z, 0, (x * z > 0 ? -.28 : .28)))
  a.push(p(box(1.1, .025, .025), iron, 0, .16, -.22), p(box(1.1, .025, .025), iron, 0, .16, .22)); add(g, a); return g
}
function seat() {
  const g = new THREE.Group(), seatM = mat('#272c2d'), iron = mat('#626562', .35, .62), a: Part[] = [p(box(.43, .06, .43), seatM, 0, .46, 0), p(box(.42, .32, .06), seatM, 0, .65, .18)]
  for (const x of [-.16, .16]) for (const z of [-.14, .14]) a.push(p(box(.025, .44, .025), iron, x, .22, z)); add(g, a); return g
}
function panel() {
  const g = new THREE.Group(), grey = mat('#9b9b95'), a: Part[] = [p(box(.9, 1.65, .035), grey, 0, .825, 0, .12)]
  for (let i = -2; i <= 2; i++) a.push(p(box(.035, 1.5, .055), grey, i * .145, .82, -.035, .12)); add(g, a); return g
}
function louver() {
  const g=new THREE.Group(),grey=mat('#8b8e88',.28,.75),a:Part[]=[]
  for(const x of [-.43,.43])a.push(p(box(.04,.85,.07),grey,x,.435,0,.10))
  for(const y of [.035,.835])a.push(p(box(.9,.045,.07),grey,0,y,0,.10))
  for(let i=0;i<10;i++)a.push(p(box(.83,.065,.016),grey,0,.09+i*.073,0,-.15))
  add(g,a);return g
}
function extinguisher() {
  const g = new THREE.Group(), red = mat('#a9362e', .12, .62), black = mat('#202321', .05, .82), a: Part[] = [p(cyl(.105, .47, 12), red, 0, .26, 0), p(new THREE.ConeGeometry(.095, .11, 10), red, 0, .55, 0), p(cyl(.045, .07, 8), black, 0, .64, 0), p(box(.13, .025, .025), black, 0, .69, 0)]
  const hose = p(cyl(.012, .14, 6), black, .105, .42, 0, 0, Math.PI / 2); a.push(hose, p(cyl(.012, .14, 6), black, .17, .36, 0, 0, Math.PI / 2), p(cyl(.012, .12, 6), black, .21, .29, 0, 0, Math.PI / 2)); add(g, a); return g
}
function crate(number = 0,count=1,upperNumber=number+10) {
  const g=new THREE.Group(),wood=mat('#e0c995',0,.92),frame=mat('#eddbad',0,.92),parts:Part[]=[]
  const board=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,vertical=false)=>{
    const geo=box(w,h,d),pos=geo.getAttribute('position'),normal=geo.getAttribute('normal'),uv=geo.getAttribute('uv'),repeat=m===wood?.8:2
    for(let i=0;i<pos.count;i++){
      const top=Math.abs(normal.getY(i))>.5,side=Math.abs(normal.getX(i))>.5
      const u=top?pos.getX(i)+w/2:side?pos.getZ(i)+d/2:pos.getX(i)+w/2
      const v=top?pos.getZ(i)+d/2:pos.getY(i)+h/2
      uv.setXY(i,(vertical?v:u)*repeat,(vertical?u:v)*repeat)
    }
    parts.push(p(geo,m,x,y,z))
  }
  for(const m of [wood,frame]){
    m.map=l1Texture('alpha/wood_color.jpg');m.normalMap=l1Texture('alpha/wood_normalgl.jpg',true);m.normalScale.set(.08,.08)
    if(m instanceof THREE.MeshStandardMaterial&&getMaterialMode()==='realistic')m.roughnessMap=l1Texture('alpha/wood_roughness.jpg',true)
    // Pale timber remap of the unmodified CC0 scan; preserve the material factory's hooks.
    const prior=m.onBeforeCompile,key=m.customProgramCacheKey()
    m.onBeforeCompile=(shader,renderer)=>{prior.call(m,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat l1WoodL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*clamp(.22+l1WoodL*1.5,.22,.86);')}
    m.customProgramCacheKey=()=>key+'|l1-pale-crate-v2'
  }
  const mark=litMaterial({map:l1Texture('l1/crate-marks.png'),transparent:true,alphaTest:.05,depthWrite:false,roughness:.92,side:THREE.FrontSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
  mark.userData.l1Owned=true
  const W=L1_CRATE.width,H=L1_CRATE.height,labels:Part[]=[]
  for(let level=0;level<count;level++){
   const y0=level*H
   for(const z of [-.30,.30])board(W,.64,.04,0,y0+.34,z,wood)
   for(const x of [-W/2+.02,W/2-.02])board(.04,.64,.62,x,y0+.34,0,wood)
   for(const y of [.02,.66])board(W,.04,.62,0,y0+y,0,wood)
   for(const x of [-W/2+.045,W/2-.045])for(const z of [-.335,.335])board(.09,H,.04,x,y0+H/2,z,frame,true)
   for(const z of [-.27,.27])for(const x of [-W/2+.0125,W/2-.0125])board(.025,H,.075,x,y0+H/2,z,frame,true)
   for(const y of [.04,.64]){
    for(const z of [-.335,.335])board(W,.08,.04,0,y0+y,z,frame)
    for(const x of [-W/2+.0125,W/2-.0125])board(.025,.08,.62,x,y0+y,0,frame)
   }
   const n=level?upperNumber:number,tile=((Number.isFinite(n)?Math.floor(n):0)%100+100)%100,u=tile%10/10,v=1-(Math.floor(tile/10)+1)/10
   const geo=new THREE.PlaneGeometry(W-.20,.49),uv=geo.getAttribute('uv')
   for(let i=0;i<uv.count;i++)uv.setXY(i,u+uv.getX(i)*.1,v+uv.getY(i)*.1)
   const front=geo.clone();front.translate(0,y0+.34,.321);const back=geo.clone();back.rotateY(Math.PI);back.translate(0,y0+.34,-.321);geo.dispose();labels.push({geo:front,mat:mark},{geo:back,mat:mark})
  }
  add(g,labels)
  for(const child of g.children)child.userData.noCastShadow=true // ink has no physical thickness
  add(g,parts);return g
}
function pathchair() {
  const g = new THREE.Group(), beige = mat('#939f89'), metal = mat('#555c57', .7, .38), a: Part[] = [p(cushion(.55,.48,.10), beige, 0,.5,0,Math.PI/2),p(cushion(.51,.55,.11),beige,0,.84,.2,-.08),p(cushion(.22,.12,.07,.035),beige,0,1.09,.12),p(new THREE.CylinderGeometry(.15,.21,.32,12),metal,0,.19,0),p(cyl(.25,.035,16),metal,0,.025,0),p(box(.4,.035,.2),metal,0,.18,-.3)]
  for (const x of [-.28,.28])a.push(p(cushion(.075,.34,.08,.03),beige,x,.66,0,Math.PI/2),p(box(.025,.16,.025),metal,x,.55,0))
  // Shallow seams read as upholstery without extra draw calls or transparent layers.
  for(const x of [-.14,.14])a.push(p(box(.006,.39,.006),metal,x,.82,.139))
  add(g,a);return g
}
function airunit() {
  const g = new THREE.Group(), grey = mat('#aaaead'), dark = mat('#202321', .1, .8), metal = mat('#777b78', .7, .4), a: Part[] = [p(box(.6, .65, .24), grey, 0, .325, 0), p(cyl(.205, .018, 24), dark, 0, .35, -.13, Math.PI / 2)]
  for (let i = 0; i < 3; i++) {const angle=i*Math.PI/1.5;a.push(p(box(.075,.16,.012),dark,-Math.sin(angle)*.09,.35+Math.cos(angle)*.09,-.145,0,angle))}
  for (let i = 0; i < 6; i++) a.push(p(new THREE.RingGeometry(.0325+i*.033,.0375+i*.033,24), metal, 0, .35, -.155,Math.PI))
  for (let i = 0; i < 8; i++) {const angle=i*Math.PI/4;a.push(p(box(.0025,.20,.003),metal,-Math.sin(angle)*.1,.35+Math.cos(angle)*.1,-.157,0,angle))}
  for (const x of [-.245, .245]) for (const y of [.1, .6]) a.push(p(cyl(.012, .008, 8), metal, x, y, -.16, Math.PI / 2))
  add(g, a); return g
}
function paintcan() {
  const g = new THREE.Group(), blue = mat('#263d61', .08, .72), grey = mat('#b5b8b0', .25, .62), metal = mat('#777b78', .72, .36), a: Part[] = [p(cyl(.115, .29, 12), blue, 0, .145, 0), p(new THREE.TorusGeometry(.108, .009, 4, 12), blue, 0, .025, 0,Math.PI/2), p(new THREE.TorusGeometry(.108, .009, 4, 12), blue, 0, .265, 0,Math.PI/2), p(cyl(.108, .012, 12), grey, 0, .3, 0), p(new THREE.TorusGeometry(.1, .008, 4, 12, Math.PI), metal, 0, .265, 0)]
  add(g, a); return g
}
function caution() { const g = new THREE.Group(), yellow = mat('#d2ad27'), a = [p(box(.28, .55, .025), yellow, 0, .275, -.08, -.12), p(box(.28, .55, .025), yellow, 0, .275, .08, .12), p(box(.24, .025, .16), yellow, 0, .04, 0)]; add(g, a); return g }

export function buildL1Prop(s: Structure): THREE.Group | null {
  const kind = typeof s.data?.l1Prop === 'string' ? s.data.l1Prop : ''
  const rawNumber=Number(s.data?.l1Number), rawSid=Number(s.data?.sid), selected=Number.isFinite(rawNumber)?rawNumber:rawSid
  const makers: Record<string, () => THREE.Group> = { foldingtable, seat, panel, louver, extinguisher, crate: () => crate(selected,l1CrateCount(s),Number(s.data?.l1UpperNumber??selected+10)), pathchair, airunit, paintcan, caution }
  const made = makers[kind]?.(); if (!made) return null
  made.position.set(s.x + s.w / 2, 0, s.y + s.h / 2)
  made.rotation.y = (Number(s.data?.deg) || 0) * Math.PI / 180
  if(kind==='pathchair')made.scale.y=.86
  return made
}

export const buildL1Props = buildL1Prop
