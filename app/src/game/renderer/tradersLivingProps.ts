import * as THREE from 'three'
import type { DressingParts } from './tradersDressingParts'
import { DRESSING_COLORS as C } from './tradersDressingParts'

export function buildTradersLivingProp(kind:string,p:DressingParts,w:number,d:number,variant:number):boolean {
 if(kind==='bedkit'){
  const legX=w/2-.1, legZ=d/2-.16
  for(const x of [-legX,legX])for(const z of [-legZ,legZ])p.box(x,.34,z,.1,.68,.1,'steel',C.steel,.02)
  p.box(0,.69,0,w-.1,.08,d-.08,'steel',C.dark,.02); p.box(0,.42,-d/2+.06,w-.16,.72,.08,'wood',C.wood,.025)
  p.box(0,.79,0,w-.16,.18,d-.12,'fabric',C.cream,.07)
  p.box(0,.91,-d/2+.25,w-.24,.16,.38,'fabric',C.paper,.08)
  p.box(0,.8975,d*.12,w-.22,.035,d*.48,'fabric',variant%2?C.green:C.wood,.02)
  for(const x of [-w/2+.16,w/2-.16])p.box(x,.91,0,.025,.035,d-.34,'fabric',C.wood,.01)
  p.box(-w*.26,.06,d*.18,.34,.12,.22,'wood',C.dark,.03); p.box(w*.26,.06,d*.18,.34,.12,.22,'wood',C.dark,.03)
  p.box(-w*.3,.98,-d/2+.38,.38,.07,.18,'fabric',C.paper,.03)
  return true
 }
 if(kind==='archive'){
  const back=-d/2+.025; p.box(0,1.03,back,w,2.05,.07,'wood',C.wood,.02)
  for(const x of [-w/2+.06,w/2-.06])p.box(x,1.03,0,.1,2.05,d,'steel',C.steel,.015)
  for(const y of [.08,.67,1.25,1.83])p.box(0,y,0,w-.12,.07,d-.08,'wood',C.wood,.015)
  for(let row=0;row<2;row++)for(let i=0;i<10;i++){
   const x=-w/2+.2+i*.21, h=.38+((i+variant+row)%4)*.035, y=row?1.285:.705
   p.box(x,y+h/2,-d/2+.16,.16,h,.23,'cardboard',i%3?C.paper:C.cream,.018)
   p.print(7,x,y+h/2,-d/2+.285,.13,h*.72,0)
  }
  p.box(w*.22,.325,-d/2+.16,.7,.42,.25,'cardboard',C.wood,.025); p.box(-w*.2,.325,-d/2+.16,.7,.42,.25,'cardboard',C.paper,.025)
  return true
 }
 if(kind==='teapoint'){
  p.box(0,.50,0,w,.95,d,'wood',C.wood,.025);p.box(0,1.02,0,w+.04,.10,d+.04,'steel',C.steel,.015)
  for(const x of [-w*.28,0,w*.28]){p.box(x,.40,d/2+.01,.015,.66,.015,'rubber',C.dark);p.box(x+.18,.72,d/2+.025,.18,.025,.03,'steel',C.steel)}
  // Low splashback, shallow upper cupboard, and separate appliance work zones.
  p.box(0,1.29,-d/2+.035,w-.18,.43,.07,'steel',C.steel,.01)
  p.box(0,2.03,-d/2+.13,w-.12,.42,.26,'paint',C.cream,.015)
  for(const x of [-w*.25,w*.25]){p.box(x,2.03,-d/2+.267,w*.485,.38,.018,'paint',C.paper,.012);p.box(x,1.9,-d/2+.285,.16,.016,.025,'steel',C.steel)}
  // Microwave: inset black door, perforated window, control dial and timer.
  p.box(.55,1.29,-.11,.72,.42,.40,'paint',C.cream,.025)
  p.box(.49,1.29,.095,.50,.32,.018,'rubber',C.dark,.012)
  p.gridPrint(13,.47,1.29,.108,.36,.22,4,3)
  p.box(.71,1.29,.12,.022,.22,.028,'steel',C.steel,.006)
  p.box(.84,1.40,.11,.09,.045,.018,'screen','#536c64');p.cylinder(.84,1.23,.105,.038,.025,'steel',C.steel)
  const dial=new THREE.CylinderGeometry(.032,.032,.026,12);dial.rotateX(Math.PI/2);dial.translate(.84,1.24,.13);p.add(dial,'rubber',C.dark)
  p.box(.85,1.23,.148,.008,.035,.006,'paper',C.paper)
  for(let i=0;i<4;i++)p.box(.33+i*.12,1.51,-.11,.06,.006,.19,'rubber',C.dark)
  // Drip coffee brewer with filter basket, pot, lid and handle.
  p.box(-.70,1.12,-.09,.36,.07,.37,'rubber',C.dark,.015)
  p.box(-.70,1.33,-.23,.30,.44,.08,'paint',C.dark,.015)
  p.box(-.70,1.52,-.11,.35,.07,.34,'paint',C.cream,.012)
  p.cylinder(-.70,1.43,-.06,.095,.12,'paint',C.dark,.065)
  p.cylinder(-.70,1.25,-.02,.095,.19,'steel',C.steel,.08);p.cylinder(-.70,1.36,-.02,.095,.022,'rubber',C.dark)
  p.torus(-.59,1.25,-.02,.052,.014,'rubber',C.dark);p.box(-.79,1.32,.015,.035,.025,.06,'steel',C.steel)
  for(const x of [-.22,.05]){
   const profile=[[.052,0],[.070,.14],[.069,.15],[.059,.143],[.045,.012],[.052,0]].map(([r,y])=>new THREE.Vector2(r,y)),g=new THREE.LatheGeometry(profile,12);g.translate(x,1.075,.23);p.add(g,'ceramic',C.paper)
   const water=new THREE.CircleGeometry(.056,12);water.rotateX(-Math.PI/2);water.translate(x,1.205,.23);p.add(water,'water','#75948c');p.torus(x+.08,1.15,.23,.026,.007,'ceramic',C.paper)
  }
  p.box(.98,1.20,-.08,.27,.25,.25,'cardboard',C.paper,.015);for(let i=0;i<3;i++)p.box(.90+i*.075,1.34,-.08,.05,.07,.18,'paper',C.paper)
  return true
 }
 return false
}
