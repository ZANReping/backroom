import * as THREE from 'three'
import {DressingParts,DRESSING_COLORS as C} from './tradersDressingParts'
/** Local +Z is the room-facing front. Wall anchors are authored separately. */
export function buildTradersWallFixture(kind:string,p:DressingParts,w:number,d:number,variant:number):boolean{
 const front=d/2-.012
 const rod=(a:number[],b:number[],r=.012,s='steel',c:string=C.steel)=>p.rod(new THREE.Vector3(a[0],a[1],a[2]),new THREE.Vector3(b[0],b[1],b[2]),r,s,c)
 const screw=(x:number,y:number,z:number)=>{const g=new THREE.CylinderGeometry(.008,.008,.008,6);g.rotateX(Math.PI/2);g.translate(x,y,z);p.add(g,'steel',C.steel)}
 switch(kind){
 case 'firecabinet':{
  p.box(0,1.14,-d/2+.02,w,1.56,.04,'paint',C.red,.012)
  for(const x of [-w/2+.025,w/2-.025])p.box(x,1.14,0,.05,1.56,d,'paint',C.red,.01)
  for(const y of [.39,1.89])p.box(0,y,0,w,.06,d,'paint',C.red,.01)
  p.cylinder(-.12,.79,.015,.085,.42,'paint',C.red);p.cylinder(-.12,1.03,.015,.034,.07,'steel',C.dark)
  rod([-.18,1.09,.025],[-.06,1.09,.025],.012,'brass',C.brass)
  rod([-.06,1.07,.03],[.01,.94,.04],.012,'rubber',C.dark);rod([.01,.94,.04],[.02,.64,.04],.013,'rubber',C.dark)
  for(const r of [.14,.10,.06])p.torus(.16,1.47,.015,r,.019,'fabric',C.cream)
  p.print(1,0,1.14,front,w-.14,.18)
  for(const y of [.62,1.64])p.box(-w/2+.015,y,front,.035,.09,.028,'steel',C.steel)
  rod([w/2-.05,1.05,front],[w/2-.05,1.25,front],.012,'steel',C.steel);return true}
 case 'firstaid':{
  p.box(0,1.64,-.025,w,.62,d-.05,'paint',C.cream,.02);p.box(0,1.64,front-.014,w-.035,.57,.028,'paint',C.paper,.01)
  p.print(8,-.04,1.64,front+.003,.30,.30);rod([w/2-.07,1.55,front+.005],[w/2-.07,1.73,front+.005])
  for(const y of [1.44,1.84])p.box(-w/2+.02,y,front,.025,.06,.025,'steel',C.steel);return true}
 case 'wallphone':{
  p.box(0,1.45,-.08,w,.6,.08,'paint',C.cream,.02);p.box(.055,1.43,-.01,.15,.24,.04,'rubber',C.dark,.01);p.print(6,.055,1.43,.013,.13,.18)
  rod([-.09,1.30,.05],[-.09,1.65,.05],.027,'rubber',C.dark)
  for(const y of [1.29,1.66])p.box(-.09,y,.05,.09,.09,.08,'rubber',C.dark,.018)
  for(let i=0;i<6;i++)rod([-.07+(i%2)*.02,1.28-i*.03,.03],[-.07+((i+1)%2)*.02,1.25-i*.03,.03],.005,'rubber',C.dark);return true}
 case 'clock':{
  const g=new THREE.CylinderGeometry(.235,.235,.06,24);g.rotateX(Math.PI/2);g.translate(0,2.35,-.01);p.add(g,'paint',C.dark)
  p.printDisk(10,0,2.35,.024,.215);rod([0,2.35,.03],[.10,2.41,.03],.008,'paint',C.dark);rod([0,2.35,.04],[.14,2.43,.04],.006,'paint',C.dark);return true}
 case 'notice':case 'mapboard':case 'whiteboard':{
  const hh=kind==='whiteboard'?1.35:1.45,y=1.65
  p.box(0,y,-.025,w,hh,.08,'wood',C.wood,.02);p.box(0,y,.022,w-.12,hh-.12,.025,kind==='whiteboard'?'paint':'fabric',kind==='whiteboard'?C.paper:C.cream)
  if(kind==='mapboard')p.print(2,0,y,.039,w-.25,hh-.23)
  else if(kind==='whiteboard'){p.print(4,0,y,.039,w*.72,hh*.70);p.box(0,.94,.05,w-.12,.05,.12,'steel',C.steel);for(let i=0;i<2;i++)rod([-.3+i*.5,.98,.08],[-.08+i*.5,.98,.08],.009,'paint',i?C.green:C.red)}
  else for(let i=0;i<3;i++){const x=(i-1)*w*.26,yy=y+(i%2?.10:-.06);p.print([0,15,4][(i+variant)%3],x,yy,.04+i*.003,w*.23,hh*.72);screw(x,yy+hh*.30,.055)}
  for(const x of [-w/2+.04,w/2-.04])for(const yy of [y-hh/2+.04,y+hh/2-.04])screw(x,yy,.03);return true}
 case 'camera':{
  p.box(0,2.54,-d/2+.04,.15,.17,.08,'steel',C.steel);rod([0,2.54,-d/2+.06],[0,2.70,-.04],.023)
  const g=new THREE.BoxGeometry(.31,.18,.27);g.rotateX(.16);g.translate(0,2.73,.025);p.add(g,'paint',C.cream)
  const lens=new THREE.CylinderGeometry(.06,.07,.055,12);lens.rotateX(Math.PI/2+.16);lens.translate(0,2.69,.17);p.add(lens,'rubber',C.dark)
  p.box(0,2.85,.025,.36,.025,.34,'steel',C.steel);return true}
 case 'radiator':{
  for(const y of [.23,.68])rod([-w/2+.05,y,0],[w/2-.05,y,0],.025)
  for(let i=0;i<9;i++)p.box(-w/2+.1+i*(w-.2)/8,.45,0,.055,.53,.12,'paint',C.cream,.012)
  p.cylinder(w/2-.035,.26,.015,.025,.17,'brass',C.brass);return true}
 case 'outlet':{
  p.box(0,.38,0,w,.20,.045,'paint',C.cream,.012)
  for(const x of [-.04,.04]){p.box(x,.38,.026,.045,.055,.012,'paint',C.paper);for(const xx of [-.008,.008])p.box(x+xx,.383,.034,.004,.013,.003,'rubber',C.dark)}
  for(const y of [.31,.45])screw(0,y,.027);return true}
 case 'utility':{
  p.box(0,1.2,-.025,w,1.68,d-.04,'steel',C.steel,.01);p.box(0,1.2,front-.02,w-.06,1.60,.025,'paint',C.green)
  p.print(14,0,1.65,front+.002,w*.55,.22);p.gridPrint(13,0,.70,front+.002,w-.18,.26,4,1)
  rod([w*.32,1.13,front],[w*.32,1.31,front],.012);return true}
 default:return false
 }
}
