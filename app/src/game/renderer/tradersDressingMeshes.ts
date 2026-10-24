import * as THREE from 'three'
import type {Structure} from '../core/types'
import {DressingParts,DRESSING_COLORS as C} from './tradersDressingParts'
import {buildTradersWallFixture} from './tradersWallFixtures'
import {buildTradersLivingProp} from './tradersLivingProps'
import {buildTradersMarketProp} from './tradersMarketMeshes'
import {buildTradersShopProp} from './tradersShopMeshes'
import {tradersLocalStructure,type DressingKind} from '../content/tradersDressingShapes'
import type {TradersAssets} from './tradersMeshes'
export function buildTradersDressing(source:Structure,assets:TradersAssets){
 const s=tradersLocalStructure(source),kind=s.data?.dressing as DressingKind,w=s.w,d=s.h,v=Number(s.data?.variant??0)
 const root=new THREE.Group();root.userData.tradersOwnGeometry=true;root.name='traders-dressing:'+kind;root.position.set(s.x+w/2,0,s.y+d/2);root.rotation.y=Number(s.data?.deg??0)*Math.PI/180
 const p=new DressingParts(assets),rod=(a:number[],b:number[],r=.014,c:string=C.steel)=>p.rod(new THREE.Vector3(a[0],a[1],a[2]),new THREE.Vector3(b[0],b[1],b[2]),r,'steel',c)
 const wheel=(x:number,z:number)=>{const g=new THREE.CylinderGeometry(.065,.065,.055,10);g.rotateZ(Math.PI/2);g.translate(x,.075,z);p.add(g,'rubber',C.dark)}
 const cabinet=(hh:number)=>{p.box(0,hh/2,0,w,hh,d,'wood',C.wood,.012);p.box(0,hh+.025,0,w+.025,.05,d+.025,'steel',C.steel,.01);for(const x of [-w*.3,0,w*.3]){p.box(x,hh/2,d/2+.005,.012,hh-.12,.008,'rubber',C.dark);p.box(x+w*.11,hh*.65,d/2+.018,.14,.02,.025,'steel',C.steel)}}
 const screen=(x:number,y:number,z:number,ww=.52,face=1)=>{p.box(x,y,z,ww,.34,.05,'rubber',C.dark,.012);p.print(5,x,y,z+face*.029,ww-.045,.28,face<0?Math.PI:0);p.box(x,y-.25,z,.035,.21,.04,'steel',C.steel);p.box(x,y-.35,z,.22,.02,.16,'steel',C.steel)}
 try{
 if(!buildTradersShopProp(kind,p,w,d,s)&&!buildTradersMarketProp(kind,p,w,d,s)&&!buildTradersWallFixture(kind,p,w,d,v)&&!buildTradersLivingProp(kind,p,w,d,v))switch(kind){
 case 'officescreen':{
  p.box(0,.78,0,w,1.0,.065,'fabric',C.green,.015);for(const x of [-w*.38,w*.38]){p.box(x,.15,0,.04,.3,.04,'steel',C.steel);p.box(x,.025,0,.34,.045,d,'steel',C.steel)}p.box(0,1.29,0,w+.02,.025,.075,'steel',C.steel);break}
 case 'storageRack':{
  const H=Number(s.data?.height??2.2)
  for(const x of [-w/2+.04,w/2-.04])for(const z of [-d/2+.04,d/2-.04]){p.box(x,H/2,z,.07,H,.07,'paint',C.green);p.box(x,.025,z,.15,.05,.15,'steel',C.steel)}
  for(let row=0;row<3;row++){
   const y=.13+row*(H-.28)/3;p.box(0,y,0,w-.05,.055,d-.04,'steel',C.steel)
   const n=Math.max(2,Math.floor(w/.7)),span=(w-.25)/n
   for(let i=0;i<n;i++){const x=-w/2+.125+(i+.5)*span,bh=.32+(i%3)*.065,dep=d-.17
    p.box(x,y+.03+bh/2,0,span-.07,bh,dep,'cardboard',i%3?C.paper:C.wood,.012)
    p.box(x,y+.04+bh,0,.045,.012,dep+.01,'paper',C.cream);p.print(11,x,y+.04+bh*.5,dep/2+.008,Math.min(.25,span-.12),.13)
   }
  }
  rod([-w/2+.04,.12,-d/2],[w/2-.04,H-.08,-d/2],.012);break}
 case 'palletLoad':{
  for(const x of [-w*.35,0,w*.35])p.box(x,.08,0,w*.12,.14,d,'wood',C.wood)
  for(let i=0;i<5;i++)p.box(-w*.4+i*w*.2,.17,0,w*.16,.045,d,'wood',C.wood)
  const H=Number(s.data?.height??1),rows=H>.9?2:1,bh=(H-.22)/rows
  for(let row=0;row<rows;row++)for(let col=0;col<2;col++)p.box((col-.5)*w*.47,.22+bh*(row+.5),0,w*.43,bh-.02,d*.84,'cardboard',row%2?C.cream:C.wood,.012)
  for(const x of [-w*.26,w*.26])p.box(x,(H+.20)/2,d*.43,.035,H-.15,.018,'fabric',C.dark)
  p.print(11,0,.34,d*.43+.012,Math.min(w*.4,.48),.20);break}
 case 'coldcabinet':{
  const H=Number(s.data?.height??1.18);p.box(0,(H-.08)/2,0,w,H-.08,d,'paint',C.cream,.025)
  for(const x of [-w*.25,w*.25]){p.box(x,H-.04,0,w*.495,.07,d+.012,'steel',C.steel,.012);p.box(x,H*.68,d/2+.012,.25,.035,.035,'steel',C.steel)}
  p.gridPrint(13,-w*.3,H*.25,d/2+.012,w*.24,.21,4,1);p.box(w*.31,H*.5,d/2+.013,.20,.08,.018,'screen','#46675c')
  for(const x of [-w*.38,w*.38])p.box(x,.06,-d/2+.025,.12,.12,.10,'rubber',C.dark);break}
 case 'copyhub':{
  p.box(0,.48,0,w,.9,d,'paint',C.cream,.025);for(let row=0;row<3;row++){p.box(-.25,.24+row*.20,d/2+.008,w*.60,.16,.025,'paint',C.paper,.01);p.box(-.25,.29+row*.2,d/2+.03,.23,.015,.025,'steel',C.steel)}
  p.box(.15,.98,-.08,w*.72,.12,d*.65,'rubber',C.dark,.015);p.box(.15,1.08,-.08,w*.73,.07,d*.66,'paint',C.paper,.012)
  p.box(-w*.34,1.12,.1,.38,.20,.32,'rubber',C.dark,.02);p.print(5,-w*.34,1.13,.268,.31,.12)
  p.box(w*.40,.72,.16,w*.28,.035,d*.6,'steel',C.steel);for(let i=0;i<4;i++)p.box(w*.40,.75+i*.008,.16,w*.22,.005,d*.48,'paper',C.paper)
  for(const x of [-w*.38,w*.38])for(const z of [-d*.34,d*.34])wheel(x,z);break}
 case 'mailboxes':{
  p.box(0,.95,-d/2+.04,w,1.86,.08,'wood',C.wood);for(const x of [-w/2+.025,w/2-.025])p.box(x,.95,0,.05,1.86,d,'steel',C.steel)
  for(let row=0;row<4;row++){const y=.28+row*.42;p.box(0,y-.19,0,w,.035,d,'steel',C.steel);for(let col=0;col<6;col++){const x=-w/2+(col+.5)*w/6;p.box(x,y,0,w/6-.025,.37,d-.03,'paint',row%2?C.cream:C.green);p.box(x,y+.07,d/2,.20,.028,.01,'rubber',C.dark);p.print(11,x,y-.08,d/2+.008,.18,.08);p.box(x+w/12-.04,y,d/2+.012,.015,.06,.025,'brass',C.brass)}}break}
 case 'packingbench':{
  p.box(0,.92,0,w,.075,d,'wood',C.wood,.015);for(const x of [-w/2+.12,w/2-.12])for(const z of [-d/2+.10,d/2-.10])p.box(x,.46,z,.065,.9,.065,'steel',C.steel)
  p.box(0,1.48,-d/2+.04,w,1.04,.08,'paint',C.green);p.gridPrint(13,0,1.48,-d/2+.086,w-.12,.9,12,4)
  for(let i=0;i<4;i++){
   const x=-w*.32+i*w*.21,z=-d/2+.14;p.box(x,1.62,z-.02,.025,.025,.05,'steel',C.steel)
   if(i===0){rod([x,1.20,z],[x,1.64,z],.014);p.torus(x,1.68,z,.04,.012,'steel',C.steel)}
   else if(i===1){p.cylinder(x,1.29,z,.030,.17,'rubber',C.red);rod([x,1.375,z],[x,1.66,z],.010);p.box(x,1.68,z,.023,.035,.009,'steel',C.steel)}
   else if(i===2){p.box(x,1.40,z,.072,.32,.028,'paint',C.green,.012);p.box(x,1.59,z,.035,.12,.010,'steel',C.steel);p.box(x,1.39,z+.02,.024,.055,.012,'rubber',C.dark)}
   else{for(const side of [-1,1]){p.rod(new THREE.Vector3(x+side*.045,1.22,z),new THREE.Vector3(x,1.49,z),.017,'rubber',C.red);rod([x,1.49,z],[x+side*.026,1.64,z],.014)}p.cylinder(x,1.50,z,.027,.028,'steel',C.steel)}
  }
  p.box(-w*.24,1.02,.12,.8,.12,.42,'steel',C.steel);p.print(3,w*.40,1.71,-d/2+.10,.30,.45)
  p.torus(.16,.9925,.16,.11,.035,'paper',C.cream,Math.PI/2);p.box(w*.33,.98,.20,.35,.045,.28,'paper',C.paper);break}
 case 'janitor':{
  p.box(-.20,.45,0,.50,.75,.48,'paint',C.green,.02);p.cylinder(-.20,.86,0,.19,.07,'rubber',C.dark)
  rod([.25,.25,-.1],[.25,1.6,-.1],.018);p.box(.25,.16,-.1,.42,.09,.24,'fabric',C.cream)
  for(const x of [-.42,.42]){wheel(x,.19);wheel(x,-.19)}p.box(0,.2,0,w,.045,d,'steel',C.steel);p.print(1,-.20,.53,.25,.27,.24);break}
 case 'washcounter':{
  // Cabinet is a shell: basin bowls do not intersect a filled wooden block.
  p.box(0,.07,0,w,.12,d-.06,'wood',C.wood,.012)
  for(const x of [-w/2+.025,0,w/2-.025])p.box(x,.46,0,.045,.77,d-.06,'wood',C.wood)
  p.box(0,.45,d/2-.045,w-.04,.72,.035,'wood',C.wood,.012)
  for(const x of [-w*.27,w*.27])p.box(x,.74,d/2-.018,.18,.018,.025,'steel',C.steel)
  // One genuine counter surface with circular cutouts under the lipped basins.
  const outline=new THREE.Shape();outline.moveTo(-w/2,-d/2);outline.lineTo(w/2,-d/2);outline.lineTo(w/2,d/2);outline.lineTo(-w/2,d/2);outline.closePath()
  for(const x of [-w*.27,w*.27]){const hole=new THREE.Path();hole.absarc(x,0,.276,0,Math.PI*2,true);outline.holes.push(hole)}
  const slab=new THREE.ExtrudeGeometry(outline,{depth:.07,bevelEnabled:false,curveSegments:16});slab.rotateX(-Math.PI/2);slab.translate(0,.865,0);p.add(slab,'ceramic',C.paper)
  for(const x of [-w*.27,w*.27]){
   const profile=[[.035,0],[.13,.02],[.23,.09],[.28,.13],[.30,.14],[.30,.156],[.275,.156],[.22,.09],[.12,.03],[.035,.014]].map(([r,y])=>new THREE.Vector2(r,y)),g=new THREE.LatheGeometry(profile,16);g.translate(x,.79,0);p.add(g,'ceramic',C.paper)
   p.cylinder(x,.810,0,.035,.01,'steel',C.dark);rod([x,.94,-.25],[x,1.14,-.25],.021);rod([x,1.14,-.25],[x,1.14,-.10],.021)
   p.box(x,1.72,-d/2+.03,1.10,.95,.035,'mirror','#adbbb7',.015)
   for(const xx of [-.56,.56])p.box(x+xx,1.72,-d/2+.045,.025,.99,.04,'steel',C.steel)
   for(const yy of [1.235,2.205])p.box(x,yy,-d/2+.045,1.14,.025,.04,'steel',C.steel)
   p.box(x+.45,1.13,-d/2+.11,.12,.25,.15,'paint',C.cream,.02);p.box(x+.45,1.27,-d/2+.11,.09,.035,.09,'rubber',C.dark)
  }
  p.print(9,0,1.55,-d/2+.06,.55,.55);break}
 case 'wcstall':{
  for(const x of [-w/2+.03,w/2-.03]){p.box(x,1.19,0,.06,1.86,d,'paint',C.cream,.01);for(const z of [-d/2+.06,d/2-.06])p.box(x,.14,z,.04,.28,.04,'steel',C.steel)}
  p.box(w/2-.10,1.19,d/2-.42,.045,1.82,.78,'paint',C.green,.01);p.box(w/2-.14,1.07,d/2-.12,.06,.12,.025,'steel',C.steel)
  p.box(0,.095,-.45,.24,.19,.35,'ceramic',C.paper,.035)
  const g=new THREE.LatheGeometry([[.10,0],[.14,.12],[.23,.27],[.26,.31],[.21,.31],[.15,.25]].map(([r,y])=>new THREE.Vector2(r,y)),14);g.scale(1,1,1.15);g.translate(0,.16,-.42);p.add(g,'ceramic',C.paper)
  const ring=new THREE.TorusGeometry(.225,.04,5,16);ring.rotateX(Math.PI/2);ring.scale(1,1,1.2);ring.translate(0,.49,-.42);p.add(ring,'paint',C.cream)
  p.box(0,.70,-.775,.40,.42,.30,'ceramic',C.paper,.025);p.box(.12,.90,-.68,.08,.012,.045,'steel',C.steel)
  const roll=new THREE.CylinderGeometry(.065,.065,.10,10);roll.rotateZ(Math.PI/2);roll.translate(-w/2+.14,.67,.17);p.add(roll,'paper',C.paper);break}
 case 'urinal':{
  p.box(0,.91,-.15,.43,.63,.13,'ceramic',C.paper,.045)
  const g=new THREE.LatheGeometry([[.06,0],[.16,.04],[.23,.16],[.23,.26],[.19,.27],[.13,.08]].map(([r,y])=>new THREE.Vector2(r,y)),14);g.scale(1,1,.78);g.translate(0,.51,-.015);p.add(g,'ceramic',C.paper)
  rod([0,1.03,-.08],[0,1.27,-.08],.018);p.box(0,1.15,-.04,.09,.04,.09,'steel',C.steel);break}
 case 'conference':{
  p.box(0,.74,0,w,.075,d,'wood',C.wood,.025);for(const x of [-w*.34,0,w*.34]){p.box(x,.35,0,.24,.68,d*.62,'paint',C.dark);p.box(x,.025,0,1.0,.05,d*.82,'steel',C.steel)}
  for(let i=0;i<4;i++){const x=-w*.35+i*w*.23;p.box(x,.79,0,.32,.025,.4,'paper',C.paper);p.box(x+.26,.79,.12,.08,.02,.08,'steel',C.dark)}
  p.box(0,.79,-.63,.55,.025,.10,'rubber',C.dark);break}
 case 'suitcase':{
  p.box(0,.40,0,w,.65,d,'fabric',v%2?C.green:C.wood,.06)
  for(const x of [-w*.32,w*.32])p.box(x,.4,d/2+.006,.035,.59,.013,'rubber',C.dark)
  for(const x of [-.12,.12])rod([x,.70,-d*.28],[x,.93,-d*.28],.012);rod([-.12,.93,-d*.28],[.12,.93,-d*.28],.018,C.dark)
  for(const x of [-w*.34,w*.34])wheel(x,-d*.3);p.print(11,0,.46,d/2+.016,.20,.13);break}
 case 'coatstand':{
  p.cylinder(0,.035,0,.28,.05,'steel',C.steel);rod([0,.05,0],[0,1.77,0],.025)
  for(let i=0;i<4;i++){const a=i*Math.PI/2;rod([0,1.55,0],[Math.cos(a)*.25,1.72,Math.sin(a)*.25],.014)}
  p.box(.13,1.30,.04,.26,.46,.08,'fabric',v%2?C.wood:C.green,.04);break}
 case 'ticket':{
  p.box(0,.035,0,w,.07,d,'steel',C.steel,.02);p.box(0,.59,-.08,w*.58,1.1,d*.52,'paint',C.green,.02)
  p.box(0,1.18,0,w*.88,.38,d*.65,'paint',C.cream,.03);p.print(5,0,1.22,d*.33+.005,w*.72,.22)
  p.box(0,.91,d*.20,.30,.035,.06,'rubber',C.dark);p.print(15,0,.84,d*.23,.17,.16);break}
 case 'trayreturn':{
  p.box(0,.53,0,w,1.0,d,'paint',C.green,.02);p.box(0,1.07,0,w,.075,d,'steel',C.steel)
  for(const x of [-w*.3,w*.3]){p.box(x,.65,d/2+.015,w*.33,.26,.035,'rubber',C.dark,.02);for(let i=0;i<4;i++)p.box(x,1.12+i*.014,0,w*.35,.012,d*.72,'steel',C.steel,.01)}break}
 case 'rug':p.box(0,.004,0,w,.006,d,'fabric',v%2?C.green:C.wood);for(const x of [-w/2+.025,w/2-.025])p.box(x,.008,0,.05,.003,d,'fabric',C.dark);break
 case 'bedside':cabinet(.58);p.box(0,.6475,0,.24,.035,.30,'paper',C.paper);break
 case 'tabletop':{
  p.box(-.09,.775,0,.21,.035,.25,'paper',C.paper);for(const x of [.08,.18]){const g=new THREE.LatheGeometry([[.024,0],[.036,.08],[.035,.085],[.030,.08],[.02,.008]].map(([r,y])=>new THREE.Vector2(r,y)),10);g.translate(x,.7575,0);p.add(g,'ceramic',C.paper)}break}
 case 'monitors':{
  p.box(0,1.9,-.06,w,1.50,.12,'paint',C.dark);for(let row=0;row<2;row++)for(let col=0;col<3;col++){const x=(col-1)*1.12,y=1.52+row*.72;p.box(x,y,.025,1.05,.63,.08,'rubber',C.dark);p.print([5,4,2,15,5,3][row*3+col],x,y,.07,.98,.56)}break}
 case 'securitydesk':{
  cabinet(1.0);for(const x of [-w*.27,w*.27])screen(x,1.43,-.12,.56,-1)
  p.print(14,0,.64,d/2+.009,1.0,.30);p.box(-.6,1.08,.18,.32,.055,.40,'paper',C.paper);break}
 default:throw Error('Unmodelled dressing '+kind)
 }
 p.finish(root);return root
 }catch(error){p.dispose();root.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()});throw error}
}
