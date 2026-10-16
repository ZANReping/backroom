import * as THREE from 'three'
import type {NpcGearSpec} from './npcGearPlan'
import {GearGeometry,gearMaterial,type GearTile} from './npcGearGeometry'
import {NpcGearFit,type GearPoint} from './npcGearFit'
import {retroTexture,type RetroBoneName} from './retroNpc'

const C={cloth:'#b8ae98',white:'#ded8c7',dark:'#303532',leather:'#67523d',steel:'#9daba6',gold:'#b19c64',blue:'#526a86',red:'#813e36',green:'#738476'}
const add=(a:GearPoint,b:GearPoint):GearPoint=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]

export class NpcGearModels {
 readonly geo:GearGeometry
 private fit:NpcGearFit
 readonly built:{kind:string;variant?:string;triangles:number}[]=[]
 readonly root:THREE.Object3D
 constructor(root:THREE.Object3D){this.root=root;this.fit=new NpcGearFit(root);this.geo=new GearGeometry(this.fit)
  const held=new Set((root.userData.npcGearPlan as NpcGearSpec[]).filter(s=>s.side&&s.slot!=='waist'&&['book','clipboard','tool','cup','tray','abacus','jar','scale','pen'].includes(s.kind)).map(s=>s.side!))
  for(const side of held)this.fit.grip(side)
 }
 private head(){const f=this.fit.rig.headFrame,b=this.fit.bind.get('head')!;return {top:b.y+f.topY,chin:b.y+f.chinY,eye:b.y+f.eyeY,front:b.z+f.faceZ,w:f.halfW,z:b.z-.022}}
 private front(x:number,y:number,gap=.008):GearPoint{return this.fit.surface(x,y,false,gap).point}
 private box(size:GearPoint,p:GearPoint,tile:GearTile,color:string,bone:RetroBoneName='chest',rot:GearPoint=[0,0,0]){this.geo.box(size,p,tile,color,bone,rot)}
 private bodyBadge(variant='id',color=C.white){
  const x=variant==='jerry'||variant==='medallion'?0:variant==='uniform'?-.085:.085,y=variant==='register'?1.01:1.29
  this.geo.patch(x-.029,x+.029,y-.023,y+.023,variant==='medic'||variant==='cross'||variant==='nurse'?'cross':'label',color,false,.008,2,2)
  if(variant==='medallion'||variant==='jerry'){const p=this.front(0,y,.012);this.geo.ring(p,.025,.025,.003,'brass',C.gold,'chest')}
 }
 private belt(color=C.leather){
  // Front/back surfaces use shirt skinning; narrow side bridges follow the hips.
  const w=this.fit.halfWidth(1.02)*.97
  this.geo.patch(-w,w,1.005,1.039,'leather',color,false,.009,8,1);this.geo.patch(-w,w,1.005,1.039,'leather',color,true,.009,8,1)
  for(const x of [-w,w]){const a=this.fit.surface(x,1.022),b=this.fit.surface(x,1.022,true);this.box([.012,.035,Math.abs(a.point[2]-b.point[2])],[x,1.022,(a.point[2]+b.point[2])/2],'leather',color,'hips')}
  const p=this.front(0,1.023,.017);this.geo.ring(p,.021,.015,.003,'brass',C.gold,'hips', 'xy',8)
 }
 private hat(variant:string,color?:string){
  const h=this.head(),rx=h.w+ .015,rz=.099,z=h.z,base=h.top-.045
  const c=color??({chef:C.white,nurse:C.white,surgical:C.green,hardhat:'#b8a66c',flight:C.leather,formal:'#64505c',crown:C.blue,captain:C.white,tar:'#242b2c'}[variant]??C.dark)
  let top=h.top+.025
  if(variant==='chef')top=h.top+.15
  if(variant==='crown')top=h.top+.19
  if(variant==='formal')top=h.top+.045
  if(variant==='nurse')top=h.top+.035
  if(variant==='tar')top=h.top+.10
  const tile:GearTile=variant==='flight'?'leather':variant==='hardhat'||variant==='tar'?'enamel':'cloth'
  this.fit.tuckHair(base,Math.min(top,h.top+.025),rx,rz,z)
  if(variant==='crown'){
   this.geo.loft([{y:base,rx,rz,z},{y:h.top+.07,rx:rx*.85,rz:.045,z},{y:top,rx:.003,rz:.014,z}],tile,c,'head')
   this.geo.tube([[0,base,z+rz+.003],[0,h.top+.06,z+.047],[0,top,z+.015]],.006,'brass',C.gold,'head')
  }else{
   const spread=variant==='beret'?1.24:variant==='chef'?1.18:1
   this.geo.loft([{y:base,rx,rz,z},{y:base+.028,rx:rx*spread,rz:rz*spread,z},{y:top-.024,rx:rx*.86*spread,rz:rz*.8,z:z-(variant==='tar'?.05:0),x:variant==='beret'?.016:0},{y:top,rx:.004,rz:.004,z:z-(variant==='tar'?.1:0)}],tile,c,'head')
  }
  this.geo.loft([{y:base-.003,rx:rx+.002,rz:rz+.002,z},{y:base+.016,rx:rx+.002,rz:rz+.002,z}],'seam',variant==='captain'?C.dark:c,'head')
  if(['formal','hardhat','captain'].includes(variant)){
   const rr=variant==='formal'?1.32:1.12
   this.geo.loft([{y:base-.008,rx:rx*rr,rz:rz*rr,z:z+.006},{y:base,rx:rx*rr,rz:rz*rr,z:z+.006},{y:base+.002,rx,rz,z}],'leather',variant==='captain'?C.dark:c,'head')
  }
  if(variant==='flight')for(const s of [-1,1])this.geo.oval([.014,.048,.035],[s*(rx-.006),h.eye-.015,z],'leather',c,'head',8)
  if(variant==='nurse'){
   this.box([rx*1.8,.042,.008],[0,base+.015,z+rz+.006],'cloth',C.white,'head')
   this.box([.012,.027,.002],[0,base+.016,z+rz+.012],'plain','#897a9e','head');this.box([.027,.01,.002],[0,base+.016,z+rz+.013],'plain','#897a9e','head')
  }
  if(variant==='captain'||variant==='beret')this.geo.oval([.013,.016,.003],[.025,base+.025,z+rz*.96],'brass',variant==='beret'?(this.root.userData.npcGearBadge??C.gold):C.gold,'head',8)
  if(variant==='tar')this.geo.tube([[-.055,h.eye+.008,h.front+.009],[.055,h.eye+.008,h.front+.009]],.003,'enamel','#99c7cf','head',4)
  if(variant==='hardhat')this.geo.tube([[0,base+.03,z-rz],[0,top+.003,z-.02],[0,base+.03,z+rz]],.005,'enamel',c,'head')
 }
 private eyewear(variant='round',goggles=false){
  const h=this.head(),y=h.eye+(goggles?.043:variant==='low'?-.015:0),z=h.front+(goggles?.001:.012),rw=goggles?.028:.025,rh=goggles?.019:.016
  for(const s of [-1,1]){
   this.geo.ring([s*.037,y,z],rw,rh,goggles?.0045:.0023,goggles?'leather':'steel',goggles?C.leather:C.dark,'head','xy',10)
   this.geo.tube([[s*.063,y,z],[s*(h.w+.007),y,z-.025],[s*(h.w+.008),y-.008,h.z]],.0025,'steel',C.dark,'head',4)
   if(variant==='sunglasses'||goggles){this.geo.oval([rw-.002,rh-.002,.0015],[s*.037,y,z-.001],'glass',variant==='sunglasses'?'#383e3d':'#aab4ae','head',10)}
  }
  this.geo.tube([[-.012,y,z],[0,y+.006,z+.006],[.012,y,z]],.0024,'steel',C.dark,'head',4)
 }
 private headband(color=C.blue){const h=this.head();this.geo.loft([{y:h.top-.048,rx:h.w+.011,rz:.102,z:h.z},{y:h.top-.027,rx:h.w+.014,rz:.104,z:h.z}],'cloth',color,'head')}
 private headset(variant='headphones'){
  const h=this.head(),rx=h.w+.032,y=h.eye-.008,z=h.z
  const points:GearPoint[]=[];for(let i=0;i<=10;i++){const a=i/10*Math.PI;points.push([Math.cos(a)*rx,y+Math.sin(a)*(h.top-y+.036),z])}
  this.geo.tube(points,.007,'leather',C.dark,'head',5)
  for(const s of variant==='single'?[1]:[-1,1]){this.geo.oval([.018,.038,.033],[s*rx,y,z],'leather','#424b46','head',8);this.geo.oval([.008,.027,.024],[s*(rx+.015),y,z],'steel','#525e57','head',8)}
  if(variant==='radio'||variant==='single'){this.geo.tube([[rx+.012,y-.018,z],[rx+.017,y-.04,z+.055],[.036,y-.052,h.front+.019]],.0025,'rubber',C.dark,'head');this.geo.oval([.011,.006,.008],[.036,y-.052,h.front+.019],'rubber',C.dark,'head',6)}
 }
 private apron(variant=''){
  const color=variant==='robe'?C.blue:C.cloth
  const width=Math.min(.14,this.fit.halfWidth(1.03)*.95)
  if(variant==='robe'){
   this.geo.strap(0,1.42,0,1.04,.024,'brass',C.gold)
   this.geo.patch(-width,width,1.035,1.056,'cloth',C.gold,false,.017,6,1)
   return
  }
  this.geo.skirt(width,'cloth',color)
  this.geo.patch(-.075,.075,1.055,1.325,'cloth',color,false,.012,4,6)
  this.geo.patch(-.065,.065,1.12,1.19,'seam','#a99e87',false,.015,4,2)
  for(const s of [-1,1]){this.geo.strap(s*.061,1.316,s*.067,1.44,.016,'cloth',color);this.geo.strap(s*.067,1.43,s*.11,1.05,.016,'cloth',color,true)}
  this.geo.patch(-width,width,1.035,1.056,'cloth',C.white,false,.017,6,1)
  this.geo.patch(-width,width,1.035,1.056,'cloth',color,true,.012,6,1)
 }
 private book(variant:string,side:'left'|'right',clipboard=false){
  const {point,bone}=this.fit.hand(side),sgn=side==='left'?-1:1,p=add(point,[sgn*.066,-.057,.008]),w=.142,hh=.202
  const c=variant==='bluebinder'?C.blue:variant==='medical'?C.green:variant==='diary'?'#60566a':C.leather
  if(clipboard){
   this.box([w,hh,.009],p,'wood','#938875',bone)
   this.box([w-.014,hh-.024,.002],add(p,[0,-.003,.006]),'paper',C.white,bone)
   this.box([.046,.014,.006],add(p,[0,hh*.42,.01]),'steel',C.steel,bone)
  }else{
   this.box([w-.007,hh-.006,.021],p,'paper',C.white,bone)
   for(const dz of [-.014,.014])this.box([w,hh,.004],add(p,[0,0,dz]),'leather',c,bone)
   this.box([.008,hh,.028],add(p,[-sgn*(w*.5-.004),0,0]),'seam',c,bone)
   if(variant==='ledger')this.box([.038,.022,.003],add(p,[sgn*w*.37,0,.018]),'brass',C.gold,bone)
   if(variant==='stack')this.box([w*.96,hh*.96,.026],add(p,[sgn*.006,0,-.031]),'cloth','#6b5852',bone)
  }
 }
 private cup(side:'left'|'right',tray=false){
  const {point,bone}=this.fit.hand(side),s=side==='left'?-1:1,p=add(point,[s*(tray?.09:.055),tray?.053:-.012,.022]),r=.033
  const rings=[{y:p[1]-.042,rx:r*.82,rz:r*.82,x:p[0],z:p[2]},{y:p[1]+.037,rx:r,rz:r,x:p[0],z:p[2]},{y:p[1]+.038,rx:r-.004,rz:r-.004,x:p[0],z:p[2]},{y:p[1]-.032,rx:r*.7,rz:r*.7,x:p[0],z:p[2]}]
  this.geo.loft(rings,'enamel',C.white,bone,12)
  this.geo.ring([p[0]-s*.038,p[1],p[2]],.016,.025,.004,'enamel',C.white,bone)
  this.geo.loft([{y:p[1]+.026,rx:r-.006,rz:r-.006,x:p[0],z:p[2]},{y:p[1]+.026,rx:.001,rz:.001,x:p[0],z:p[2]}],'glass','#58463a',bone,12)
 }
 private tool(variant:string,side:'left'|'right',waist=false){
  const hand=this.fit.hand(side),bone:RetroBoneName=waist?'hips':hand.bone,p:GearPoint=waist?this.front(.12,.97,.023):hand.point
  const shaft=(lo:number,hi:number,r=.009,color=C.leather)=>this.geo.tube([add(p,[0,lo,0]),add(p,[0,hi,0])],r,'wood',color,bone,6)
  if(variant==='calculator'||variant==='tape'||variant==='tapegun'){
   const center=add(p,[(side==='left'?-1:1)*.025,-.026,.018]);this.box([variant==='calculator'?.085:.065,.105,.025],center,'rubber','#505b53',bone)
   this.box([.06,.025,.002],add(center,[0,.031,.014]),'glass','#9dafa0',bone)
   if(variant==='calculator')for(let i=0;i<3;i++)for(let j=0;j<3;j++)this.box([.013,.011,.003],add(center,[(i-1)*.02,-.004-j*.019,.015]),'enamel',C.cloth,bone)
   if(variant==='tapegun')this.geo.ring(add(center,[0,.047,0]),.033,.033,.012,'paper',C.cloth,bone)
  }else if(variant==='axe'){
   shaft(-.16,.31,.011,'#897456');const q=add(p,[.027,.28,0]);this.box([.12,.075,.025],q,'brass',C.gold,bone,[0,0,.12]);this.box([.027,.096,.009],add(q,[.065,0,0]),'steel','#c2b689',bone,[0,0,.12])
  }else if(variant==='net'){
   shaft(-.12,.58,.007);const center=add(p,[0,.69,0]);this.geo.ring(center,.11,.13,.004,'steel',C.steel,bone)
   // An open lattice has no opaque cone concealing the environment.
   for(let i=-2;i<=2;i++){const x=i*.032;this.geo.tube([add(center,[x,-.11,0]),add(center,[x,-.02,-.07]),add(center,[x,.11,0])],.0013,'cloth',C.cloth,bone,3)}
   for(let i=-2;i<=2;i++){const y=i*.035;this.geo.tube([add(center,[-.09,y,0]),add(center,[0,y,-.075]),add(center,[.09,y,0])],.0013,'cloth',C.cloth,bone,3)}
  }else if(variant==='magnifier'){
   shaft(-.06,.08,.006,C.dark);this.geo.ring(add(p,[0,.13,0]),.052,.052,.005,'steel',C.steel,bone)
  }else if(variant==='spear'){
   shaft(-.57,.62,.011,'#afa58a');this.geo.loft([{y:p[1]+.61,rx:.023,rz:.011,x:p[0],z:p[2]},{y:p[1]+.8,rx:.001,rz:.001,x:p[0],z:p[2]}],'enamel',C.white,bone,5)
  }else if(variant==='saw'){
   this.geo.ring(p,.022,.045,.008,'wood',C.leather,bone);this.box([.012,.065,.27],add(p,[0,-.015,.17]),'steel',C.steel,bone)
   for(let i=0;i<6;i++)this.box([.01,.018,.022],add(p,[0,-.052,.065+i*.038]),'steel',C.steel,bone,[.7,0,0])
  }else if(variant==='mop'){
   shaft(-.72,.2,.008);const q=add(p,[0,-.72,0]);this.box([.16,.022,.055],q,'wood',C.leather,bone)
   for(let i=0;i<7;i++)this.geo.tube([add(q,[(i-3)*.023,0,0]),add(q,[(i-3)*.025,-.048,.023])],.006,'knit',C.cloth,bone,4)
  }else if(variant==='wrench'){
   shaft(-.07,.09,.008,C.steel);this.geo.tube([add(p,[-.023,.13,0]),add(p,[-.023,.1,0]),add(p,[0,.086,0]),add(p,[.023,.1,0]),add(p,[.023,.13,0])],.007,'steel',C.steel,bone)
  }else{
   shaft(-.08,variant==='baton'?.25:.1,variant==='baton'?.014:.007,variant==='baton'?C.dark:C.leather)
   if(variant==='hammer')this.box([.095,.032,.034],add(p,[0,.11,0]),'steel',C.steel,bone)
   if(variant==='paint'){this.box([.044,.024,.012],add(p,[0,.1,0]),'steel',C.steel,bone);this.box([.042,.05,.011],add(p,[0,.136,0]),'knit',C.cloth,bone)}
   if(variant==='screwdriver')this.geo.tube([add(p,[0,.06,0]),add(p,[0,.17,0])],.003,'steel',C.steel,bone)
  }
 }
 private necklace(variant:string){
  const h=this.head(),y=h.chin-.022
  if(variant==='watch'){const points:GearPoint[]=[];for(let i=0;i<=10;i++){const t=i/10;points.push(this.front(-.1+.2*t,1.18-Math.sin(t*Math.PI)*.055,.011))}this.geo.tube(points,.0018,'brass',C.gold,'spine',4);return}
  const steth=variant==='stethoscope',bottom=steth?1.19:variant==='chain'?1.24:1.34
  const points:GearPoint[]=[[-.053,y,-.018],[-.065,y-.015,.025]]
  for(let i=0;i<=10;i++){const a=i/10*Math.PI;points.push(this.front(-Math.cos(a)*.069,y-.038-Math.sin(a)*(y-bottom-.038),.015))}
  points.push([.065,y-.015,.025],[.053,y,-.018]);this.geo.tube(points,steth?.004:.002,'leather',steth?C.dark:C.gold,'chest',4)
  if(variant==='pearls')for(let i=1;i<points.length-1;i++)this.geo.oval([.0045,.0045,.0045],points[i],'enamel',C.white,'chest',6)
  if(steth){const p=this.front(.015,bottom-.025,.023);this.geo.oval([.018,.018,.004],p,'steel',C.steel,'chest',10)}
 }
 private scarf(variant:string){
  const h=this.head(),y=h.chin-.025
  if(variant==='tails'){
   this.geo.oval([.026,.016,.019],[0,h.top-.052,h.z-.104],'cloth',C.green,'head',8)
   for(const s of [-1,1])this.box([.027,.11,.006],[s*.015,h.top-.11,h.z-.108],'cloth',C.green,'head',[.1,0,s*.14]);return
  }
  this.geo.loft([{y:y-.014,rx:.062,rz:.059,z:-.008},{y:y+.014,rx:.059,rz:.057,z:-.008}],'cloth',variant==='lapel'?C.red:C.cloth,'chest')
  this.geo.strap(.025,y-.006,.018,1.29,.032,'cloth',variant==='lapel'?C.red:C.cloth)
 }
 private pouch(variant:string,side:'left'|'right'){
  if(variant==='paint'){const {point:p,bone}=this.fit.hand(side);this.geo.loft([{y:p[1]-.16,rx:.041,rz:.041,x:p[0],z:p[2]},{y:p[1]-.065,rx:.051,rz:.051,x:p[0],z:p[2]},{y:p[1]-.066,rx:.046,rz:.046,x:p[0],z:p[2]},{y:p[1]-.15,rx:.036,rz:.036,x:p[0],z:p[2]}],'steel',C.steel,bone,10);this.geo.ring(add(p,[0,-.055,0]),.05,.055,.0025,'steel',C.dark,bone);return}
  const sign=side==='left'?-1:1,p=this.front(sign*this.fit.halfWidth(.94)*.75,.94,.027),w=variant==='satchel'?.15:.085
  const medic=variant==='medic'
  this.box([w,.15,.048],p,medic?'cloth':'leather',medic?C.cloth:C.leather,'hips',[0,sign*.2,0]);this.box([w*.94,.05,.006],add(p,[0,.046,.026]),'seam',medic?C.white:'#837058','hips',[0,sign*.2,0]);this.box([.016,.025,.009],add(p,[0,.015,.03]),'brass',C.gold,'hips')
  if(medic)this.box([.041,.04,.003],add(p,[0,-.029,.027]),'cross',C.white,'hips',[0,sign*.2,0])
 }
 private abacus(side:'left'|'right',waist=false){
  const hand=this.fit.hand(side),p=waist?this.front(-.105,.98,.03):add(hand.point,[side==='left'?-.055:.055,-.04,.01]),b:RetroBoneName=waist?'hips':hand.bone
  for(const x of [-.065,.065])this.box([.009,.12,.015],add(p,[x,0,0]),'wood',C.leather,b)
  for(const y of [-.06,.06,.01])this.box([.139,.007,.015],add(p,[0,y,0]),'wood',C.leather,b)
  for(let i=0;i<5;i++){const x=(i-2)*.023;this.geo.tube([add(p,[x,-.055,0]),add(p,[x,.055,0])],.0017,'steel',C.gold,b,4);for(const y of [-.035,-.021,.032])this.geo.oval([.009,.005,.008],add(p,[x,y,0]),'wood','#66523b',b,6)}
 }
 private guitar(){
  this.fit.grip('left')
  this.geo.strap(-.1,1.39,.11,1.05,.035,'leather',C.dark)
  this.geo.strap(-.1,1.39,.11,1.05,.035,'leather',C.dark,true)
  // This one prop is independently animated between the back and the hands.
  const kit=new GearGeometry(this.fit),p:GearPoint=[0,0,0],b:RetroBoneName='spine'
  kit.oval([.125,.17,.027],p,'wood','#78453a',b,12);kit.oval([.074,.1,.029],[0,.13,0],'wood','#78453a',b,10)
  kit.oval([.07,.115,.002],[.018,0,.029],'enamel',C.cloth,b,10)
  kit.box([.037,.41,.025],[0,.35,0],'wood',C.leather,b);kit.box([.055,.11,.024],[0,.61,0],'wood','#755d44',b)
  for(let i=0;i<6;i++)kit.tube([[-.012+i*.004,-.08,.032],[-.012+i*.004,.64,.014]],.00055,'steel',C.steel,b,3)
  for(let i=0;i<6;i++)kit.box([.057,.002,.004],[0,.2+i*.053,.015],'steel',C.steel,b)
  const group=new THREE.Group(),mesh=new THREE.Mesh(kit.geometry(),gearMaterial());group.add(mesh);group.userData.joeyGuitar=1;group.userData.humanoidAttachment=true
  group.userData.gearRest=[-.065,.035,-.16];group.userData.gearPlay=[.035,-.035,.18]
  group.position.fromArray(group.userData.gearRest);group.rotation.z=-.35;this.fit.rig.bones.spine.add(group)
 }
 build(spec:NpcGearSpec){
  const start=this.geo.triangles,v=spec.variant??'',s=spec.side??'left',h=this.head()
  switch(spec.kind){
   case 'hat':this.hat(v,spec.color);break
   case 'glasses':this.eyewear(v);break
   case 'goggles':this.eyewear(v,true);break
   case 'headset':this.headset(v);break
   case 'band':this.headband(v==='headscarf'?C.green:C.blue);break
   case 'apron':this.apron(v);break
   case 'belt':this.belt();break
   case 'badge':this.bodyBadge(v,spec.color??C.white);break
   case 'book':this.book(v,s);break
   case 'clipboard':this.book(v,s,true);break
   case 'tool':this.tool(v,s,spec.slot==='waist');break
   case 'necklace':this.necklace(v);break
   case 'scarf':this.scarf(v);break
   case 'pouch':this.pouch(v,s);break
   case 'abacus':this.abacus(s,spec.slot==='waist');break
   case 'guitar':this.guitar();break
   case 'cup':this.cup(s,this.root.userData.npcGearPlan?.some((v:NpcGearSpec)=>v.kind==='tray'));break
   case 'tray':{const {point,bone}=this.fit.hand(s),p=add(point,[(s==='left'?-1:1)*.075,.007,.02]);this.geo.loft([{y:p[1],rx:.105,rz:.072,x:p[0],z:p[2]},{y:p[1]+.005,rx:.105,rz:.072,x:p[0],z:p[2]},{y:p[1]+.003,rx:.001,rz:.001,x:p[0],z:p[2]}],'steel',C.steel,bone,12);break}
   case 'strap':this.geo.strap(-.1,1.42,.13,1.01,.027,'leather',C.leather);this.geo.strap(-.1,1.42,.13,1.01,.027,'leather',C.leather,true);break
   case 'towel':this.geo.patch(-.145,-.067,1.14,1.43,'knit',C.cloth);this.geo.patch(-.145,-.067,1.25,1.43,'knit',C.cloth,true);break
   case 'epaulette':for(const sign of [-1,1]){const b:RetroBoneName=sign===-1?'clavicleR':'clavicleL',p=this.fit.point(b,[sign*.105,0,-.005]);p[1]=this.fit.shoulderHeight(p[0],p[2])+.003;this.geo.oval([.044,.008,.035],p,'cloth',v==='armor'?C.red:C.dark,b,8);if(v!=='armor')this.box([.036,.003,.016],add(p,[0,.009,0]),'brass',C.gold,b)}break
   case 'keys':{const p=this.front(.135,1.01,.021);this.geo.ring(p,.012,.014,.0018,'steel',C.steel,'hips', 'xy',8);for(let i=0;i<3;i++){const x=(i-1)*.01;this.geo.tube([add(p,[x,-.008,0]),add(p,[x,-.059,.003])],.0023,'brass',C.gold,'hips',4);this.box([.009,.012,.004],add(p,[x+.003,-.055,.003]),'brass',C.gold,'hips')}break}
   case 'feather':{const head=spec.slot!=='chest',p:GearPoint=head?[h.w+.009,h.top-.005,h.z]:this.front(.08,1.33,.013),b:RetroBoneName=head?'head':'chest';this.geo.oval([.011,.056,.003],p,'feather',C.blue,b,8);this.geo.tube([add(p,[0,-.055,0]),add(p,[0,.054,0])],.0015,'steel',C.gold,b,4);break}
   case 'bow':{const p:GearPoint=[h.w*.85,h.top-.021,h.z-.043];for(const sign of [-1,1])this.geo.oval([.025,.017,.009],add(p,[sign*.02,0,0]),'cloth',C.red,'head',8);this.geo.oval([.008,.012,.009],p,'cloth',C.red,'head',6);break}
   case 'mask':{const y=h.eye-.064,z=h.front+.011;this.geo.loft([{y:y-.030,rx:h.w*.83,rz:.016,z:z-.016},{y:y+.030,rx:h.w*.83,rz:.026,z:z-.013}],'cloth','#a4b7a8','head');for(const sign of [-1,1])this.geo.tube([[sign*h.w*.8,y+.018,z],[sign*(h.w+.008),y+.015,h.z],[sign*h.w*.8,y-.02,z]],.0015,'cloth',C.white,'head',4);break}
   case 'collar':{const y=h.chin-.035;this.geo.loft([{y:y-.013,rx:.063,rz:.064},{y:y+.005,rx:.091,rz:.086},{y:y+.019,rx:.066,rz:.062}],'seam',C.white,'chest',20);break}
   case 'cigar':this.geo.tube([[.019,h.eye-.067,h.front+.008],[.027,h.eye-.075,h.front+.067]],.0035,'leather','#795941','head',6);break
   case 'pen':{let p:GearPoint,b:RetroBoneName;if(spec.side){const hand=this.fit.hand(s);p=hand.point;b=hand.bone}else if(spec.slot==='chest'){p=this.front(-.083,1.29,.013);b='chest'}else{p=[h.w+.01,h.eye+.015,h.z];b='head'}this.geo.tube([add(p,[0,-.035,0]),add(p,[0,.025,0])],v==='pick'?.006:.0025,v==='gold'?'brass':'enamel',v==='gold'?C.gold:C.dark,b,5);break}
   case 'gloves':if(spec.slot==='waist'){const p=this.front(-.115,.94,.03);for(const sign of [-1,1]){this.geo.oval([.017,.032,.008],add(p,[sign*.011,0,0]),'leather',C.leather,'hips',6);for(let i=0;i<4;i++)this.geo.tube([add(p,[sign*.011+(i-1.5)*.006,-.018,0]),add(p,[sign*.011+(i-1.5)*.006,-.056,.004])],.003,'leather',C.leather,'hips',4)}}break
   case 'boots':break // Native retro shoe profile is selected before building the body; no duplicate boot shell.
   case 'bird':{const p=this.fit.point('clavicleL',[.115,-.008,0]);this.geo.oval([.025,.045,.028],add(p,[0,.032,0]),'feather',C.blue,'clavicleL',8);this.geo.oval([.023,.024,.024],add(p,[0,.084,.015]),'feather','#667d95','clavicleL',8);this.geo.oval([.011,.009,.017],add(p,[0,.079,.038]),'enamel',C.gold,'clavicleL',6);this.geo.oval([.014,.035,.008],add(p,[0,.01,-.04]),'feather',C.blue,'clavicleL',6);for(const sign of [-1,1])this.geo.tube([add(p,[sign*.01,.01,0]),add(p,[sign*.01,0,.015])],.002,'steel',C.dark,'clavicleL',4);break}
   case 'jar':{const hand=this.fit.hand(s),p=add(hand.point,[(s==='left'?-1:1)*.055,-.025,0]);if(v==='indexcards'){this.box([.105,.07,.06],p,'wood',C.leather,hand.bone);this.box([.09,.01,.048],add(p,[0,.034,0]),'paper',C.white,hand.bone)}else{this.geo.loft([{y:p[1]-.06,rx:.043,rz:.043,x:p[0],z:p[2]},{y:p[1]+.05,rx:.043,rz:.043,x:p[0],z:p[2]},{y:p[1]+.06,rx:.036,rz:.036,x:p[0],z:p[2]}],'glass','#a9b9b0',hand.bone,10);this.box([.055,.05,.002],add(p,[0,0,.043]),'label',C.white,hand.bone);this.geo.loft([{y:p[1]+.058,rx:.041,rz:.041,x:p[0],z:p[2]},{y:p[1]+.067,rx:.041,rz:.041,x:p[0],z:p[2]},{y:p[1]+.067,rx:.001,rz:.001,x:p[0],z:p[2]}],'steel',C.steel,hand.bone,10)}break}
   case 'scale':{const {point:p,bone}=this.fit.hand(s);this.geo.tube([p,add(p,[0,.11,0])],.004,'brass',C.gold,bone);this.geo.tube([add(p,[-.08,.1,0]),add(p,[.08,.1,0])],.003,'brass',C.gold,bone);for(const sign of [-1,1]){const q=add(p,[sign*.08,-.04,0]);this.geo.tube([add(p,[sign*.08,.1,0]),q],.0015,'steel',C.steel,bone,3);this.geo.loft([{y:q[1],rx:.035,rz:.035,x:q[0],z:q[2]},{y:q[1]-.008,rx:.003,rz:.003,x:q[0],z:q[2]}],'brass',C.gold,bone,8)}break}
   case 'radio':{this.geo.strap(0,1.42,.06,1.2,.008,'leather',C.dark);const p=this.front(.055,1.205,.025);this.box([.047,.077,.022],p,'rubber',C.dark);this.box([.035,.038,.003],add(p,[0,-.008,.013]),'mesh',C.steel);this.geo.tube([add(p,[.016,.037,0]),add(p,[.016,.091,0])],.002,'rubber',C.dark,'chest',4);break}
   case 'pocket':this.geo.patch(.066,.112,1.29,1.32,'cloth',C.white,false,.01,2,1);break
   default:throw Error('Unimplemented NPC accessory: '+spec.kind)
  }
  this.built.push({kind:spec.kind,variant:spec.variant,triangles:this.geo.triangles-start})
 }
 finish(){
  // Native shoes, gloves and spectacle frames also receive the same texture detail.
  // This reuses their existing material group and anatomical mesh, with no second shell.
  const body=this.fit.rig.mesh,g=body.geometry,uv=g.attributes.uv,si=g.attributes.skinIndex
  for(const group of g.groups){if(group.materialIndex!==3)continue
   for(let i=group.start;i<group.start+group.count;i++){
    const bone=body.skeleton.bones[si.getX(i)].name,tile=bone.startsWith('hand')?6:bone.startsWith('foot')||bone.startsWith('shin')?1:2
    uv.setXY(i,(tile%4*64+2.5+THREE.MathUtils.clamp(uv.getX(i),0,1)*59)/256,1-(Math.floor(tile/4)*64+2.5+(1-THREE.MathUtils.clamp(uv.getY(i),0,1))*59)/256)
   }
   const m=(body.material as THREE.MeshLambertMaterial[])[3],map=retroTexture('/textures/npc-gear/color.png');m.map=map;m.emissiveMap=map;m.emissive.setHex(0xffffff);m.emissiveIntensity=.10;m.needsUpdate=true
  }uv.needsUpdate=true
  const mesh=this.geo.finish();g.computeVertexNormals();g.computeBoundingSphere()
  this.root.userData.npcGear={version:1,items:this.built,triangles:this.geo.triangles,draws:mesh?1:0,surfaceSamples:this.fit.samples.length,maxSurfaceGap:Math.max(0,...this.fit.samples.map(p=>p.gap))};return mesh
 }
}

