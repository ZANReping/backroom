import * as THREE from 'three'
import type {Structure} from '../core/types'
import {l2Material,type L2Surface} from './l2Materials'

/** Compact floor-standing versions of the five formerly embedded machines.
 * All fronts are local +Z, so controls always face the accessible corridor. */
export function buildL2Machine(s:Structure) {
  const g=new THREE.Group(),v=String(s.data?.l2Variant??'tidy'),mv=Number(s.data?.mv??0)
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat:L2Surface='steel')=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),l2Material(v,mat));mesh.position.set(x,y,z);g.add(mesh);return mesh
  }
  const cylinder=(r:number,length:number,x:number,y:number,z:number,axis:'x'|'y'='y',mat:L2Surface='steel')=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,16),l2Material(v,mat));if(axis==='x')mesh.rotation.z=Math.PI/2;mesh.position.set(x,y,z);g.add(mesh)
  }
  box(.92,.12,.74,0,.06,0,'black')
  if(mv===0) {
    cylinder(.35,.86,0,1.02,0,'x',s.data?.dead?'rust':'steel')
    for(const x of [-.31,.31]){box(.07,.62,.5,x,.38,0,'black');cylinder(.365,.035,x,1.02,0,'x','black')}
    cylinder(.08,1.1,-.32,1.9,-.22)
    box(.35,.22,.035,0,.99,.36,'black');box(.19,.10,.02,0,.99,.39,'red')
  }else if(mv===4) {
    for(const x of [-.29,0,.29]){cylinder(.105,1.25,x,.8,0,'y','rust');for(let j=0;j<4;j++)cylinder(.13,.035,x,1.48+j*.1,0)}
    box(.86,.075,.08,0,1.89,0,'rust');box(.26,.18,.05,0,.48,.29,'black')
  }else {
    const h=mv===3?2.13:1.37
    box(.86,h,.65,0,h/2+.12,0)
    if(mv!==3)cylinder(.24,.78,0,1.71,0,'x','black')
    for(let j=0;j<6;j++)box(.58,.024,.022,0,.4+j*.085,.339,'black')
    box(.48,.31,.025,0,h-.22,.343,'black')
    for(let j=0;j<3;j++)box(.055,.055,.014,-.13+j*.13,h-.17,.365,j===0?'red':'insulation')
    box(.035,.22,.065,.32,1.03,.36,'black')
  }
  return g
}

/** Place the full back of the already-oriented object 15mm in front of its
 * backing plane. Measuring the mesh avoids hard-coded depths burying parts. */
export function alignL2WallProp(g:THREE.Group,s:Structure) {
  if(!s.data?.l2WallProp)return
  const dir=Number(s.data.l2WallDir),cx=s.x+s.w/2,cz=s.y+s.h/2
  if(['machinewall','generator','cabinet','pipes','valve'].includes(s.kind))g.rotation.y=[0,-Math.PI/2,Math.PI,Math.PI/2][dir]
  g.updateMatrixWorld(true)
  const b=new THREE.Box3().setFromObject(g)
  if(b.isEmpty())return
  const tx=Math.floor(cx),tz=Math.floor(cz),gap=s.kind==='graffiti'?.009:.015
  if(dir===0)g.position.z+=tz+gap-b.min.z
  else if(dir===2)g.position.z+=tz+1-gap-b.max.z
  else if(dir===3)g.position.x+=tx+gap-b.min.x
  else g.position.x+=tx+1-gap-b.max.x
}
