import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Structure } from '../core/types'
import type { GameMap } from '../world/mapgen'
import { doorNeedsRotate } from '../world/mapgen'
import { l5Material, l5WorldUV, type L5Surface } from './l5Materials'
import { makeCanvasCtx, toTex } from './shared'

const glow=new THREE.MeshBasicMaterial({color:'#fff4dc'})
const dial=new THREE.MeshBasicMaterial({color:'#d9d6bb'})
const ember=new THREE.MeshBasicMaterial({color:'#ad5427'})
const labels=new Map<string,THREE.Material>()
function label(text:string,silver=false){
  const key=text+silver;let mat=labels.get(key);if(mat)return mat
  const[c,ctx]=makeCanvasCtx(512,128);ctx.fillStyle=silver?'#a8aaa5':'#31443c';ctx.fillRect(0,0,512,128)
  ctx.strokeStyle=silver?'#e5e3ce':'#b6b9a1';ctx.lineWidth=6;ctx.strokeRect(7,7,498,114)
  ctx.font='bold 36px sans-serif';ctx.fillStyle=silver?'#292d2b':'#f0e9d6';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,67,472)
  mat=new THREE.MeshLambertMaterial({map:toTex(c)});labels.set(key,mat);return mat
}
function mesh(g:THREE.Group,geo:THREE.BufferGeometry,s:L5Surface|THREE.Material,x=0,y=0,z=0){
  if(typeof s==='string')l5WorldUV(geo,0,0,s==='insulation'?2:.7)
  const m=new THREE.Mesh(geo,typeof s==='string'?l5Material(s):s);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m
}
const box=(g:THREE.Group,w:number,h:number,d:number,s:L5Surface,x=0,y=0,z=0)=>mesh(g,new THREE.BoxGeometry(w,h,d),s,x,y,z)
const cyl=(g:THREE.Group,r:number,h:number,s:L5Surface|THREE.Material,x=0,y=0,z=0,n=18)=>mesh(g,new THREE.CylinderGeometry(r,r,h,n),s,x,y,z)
function pipe(g:THREE.Group,pts:number[][],radius:number,s:L5Surface='insulation'){
  const points=pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]))
  const curve=points.length===2?new THREE.LineCurve3(points[0],points[1]):new THREE.CatmullRomCurve3(points)
  const tube=mesh(g,new THREE.TubeGeometry(curve,points.length===2?1:12,radius,10,false),s)
  // Closed end plates stop the camera seeing through the insulation shell.
  for(const t of [0,1]){
    const end=curve.getPoint(t),normal=curve.getTangent(t).multiplyScalar(t===0?-1:1)
    const cap=mesh(g,new THREE.CircleGeometry(radius,10),s,end.x,end.y,end.z)
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal)
  }
  return tube
}
function torus(g:THREE.Group,r:number,t:number,x:number,y:number,z:number,s:L5Surface='steel'){
  return mesh(g,new THREE.TorusGeometry(r,t,6,24),s,x,y,z)
}
function wheel(g:THREE.Group,x:number,y:number,z:number,r=.27){
  torus(g,r,.021,x,y,z,'blackSteel');cyl(g,.05,.08,'steel',x,y,z).rotation.x=Math.PI/2
  for(let i=0;i<5;i++){const t=i*Math.PI*2/5;pipe(g,[[x,y,z],[x+Math.cos(t)*r,y+Math.sin(t)*r,z]],.012,'blackSteel')}
}
function gauge(g:THREE.Group,x:number,y:number,z:number){
  cyl(g,.10,.06,'steel',x,y,z).rotation.x=Math.PI/2
  mesh(g,new THREE.CircleGeometry(.085,20),dial,x,y,z+.035)
  box(g,.008,.06,.005,'blackSteel',x+.013,y+.02,z+.04).rotation.z=-.6
}
function chair(g:THREE.Group,x:number,z:number,angle:number){
  const c=new THREE.Group();c.position.set(x,0,z);c.rotation.y=angle;g.add(c)
  for(const xx of [-.23,.23])for(const zz of [-.23,.23])box(c,.045,.49,.045,'wood',xx,.245,zz)
  mesh(c,new RoundedBoxGeometry(.54,.09,.55,2,.045),'upholstery',0,.48)
  for(const xx of [-.245,.245])box(c,.034,.55,.04,'gold',xx,.74,.235)
  mesh(c,new RoundedBoxGeometry(.5,.47,.075,2,.09),'upholstery',0,.83,.235)
}
function ballroomLight(g:THREE.Group,H:number){
  const top=H-.1
  cyl(g,.26,.12,'bronze',0,top)
  for(const x of [-.72,.72])pipe(g,[[x*.3,top-.1,0],[x,top-.45,0],[x,top-.73,0]],.035,'bronze')
  for(let tier=0;tier<3;tier++){
    const r=.97-tier*.27,y=top-.72-tier*.40
    const bowl=mesh(g,new THREE.SphereGeometry(r,32,16,0,Math.PI*2,Math.PI/2,Math.PI/2),glow,0,y);bowl.scale.y=.40
    const ring=torus(g,r,.04,0,y,0,'bronze');ring.rotation.x=Math.PI/2
    for(let i=0;i<8;i++){const a=i*Math.PI/4;pipe(g,[[Math.cos(a)*r,y,Math.sin(a)*r],[Math.cos(a)*r*.4,y-r*.34,Math.sin(a)*r*.4]],.014,'gold')}
  }
  cyl(g,.055,.16,'bronze',0,top-1.65)
}
function diningTable(g:THREE.Group,mahjong:boolean){
  const table=new THREE.Group();g.add(table)
  for(const x of [-.43,.43])for(const z of [-.40,.40])pipe(table,[[x*.84,.05,z],[x,.45,z*.7],[x*.90,.84,z]],.047,'wood')
  box(table,1.38,.07,1.24,'wood',0,.84)
  box(table,1.44,.045,1.3,'linen',0,.89)
  for(const x of [-.69,.69])mesh(table,new RoundedBoxGeometry(.045,.32,1.3,2,.012),'linen',x,.73)
  for(const z of [-.63,.63])box(table,1.42,.28,.026,'linen',0,.76,z)
  if(mahjong){
    box(table,.88,.012,.78,'greenDeck',0,.918)
    for(let row=0;row<3;row++)for(let i=0;i<8;i++){
      const x=-.30+i*.082,z=-.24+row*.23, tile=box(table,.057,.08,.037,'ivory',x,.965,z)
      tile.rotation.y=row===1?.27:0;box(table,.015,.020,.006,'stem',x,.98,z+.022)
    }
    for(const x of [-.52,.52]){
      cyl(table,.045,.21,'stem',x,1.02,.42);cyl(table,.024,.07,'gold',x,1.16,.42)
      cyl(table,.035,.11,'ivory',x,1.0,.18)
    }
  }else{
    for(const x of [-.42,.42]){cyl(table,.16,.016,'ivory',x,.923,0);cyl(table,.045,.12,'ivory',x,1.0,-.34)}
    cyl(table,.075,.22,'gold',0,1.02);cyl(table,.025,.25,'ivory',0,1.23)
  }
  for(const x of [-1,1])chair(g,x,0,x<0?-Math.PI/2:Math.PI/2)
  if(mahjong)for(const z of [-.97,.97])chair(g,0,z,z<0?Math.PI:0)
}

/** Additional rooms share the same photographed hotel vocabulary without affecting other levels. */
export function buildL5RoomStructure(s:Structure,H:number,m:GameMap):THREE.Group|null{
  const profile=String(s.data?.profile??''),g=new THREE.Group();g.name=`l5-room-${s.kind}`
  switch(s.kind){
    case 'chandelier': if(profile!=='beverly'&&profile!=='dining')return null;ballroomLight(g,H);break
    case 'oddtable': diningTable(g,true);break
    case 'dtable': diningTable(g,false);break
    case 'bed': {
      const w=Math.max(.86,s.w*.90),d=Math.max(1.7,s.h*.91)
      box(g,w,.20,d,'wood',0,.23)
      mesh(g,new RoundedBoxGeometry(w,.19,d-.10,2,.055),'linen',0,.41)
      box(g,w,.055,d*.50,'damask',0,.54,-d*.16)
      mesh(g,new RoundedBoxGeometry(w*.82,.13,.40,3,.08),'linen',0,.56,d*.29)
      box(g,w+.15,1.14,.085,'wood',0,.64,d*.5)
      box(g,w-.06,.64,.027,'upholstery',0,.83,d*.5+.05)
      for(const x of [-w/2,w/2]){box(g,.035,1.13,.025,'gold',x,.67,d*.5+.057);cyl(g,.07,.055,'wood',x,1.26,d*.5)}
      for(const z of [-d*.42,d*.42])for(const x of [-w*.39,w*.39])box(g,.075,.16,.075,'wood',x,.08,z)
      g.rotation.y=Number(s.data?.deg??0)*Math.PI/180;break
    }
    case 'dresser': {
      // Hollow carcass: the animated drawers own their fronts, handles and boxes.
      box(g,.86,.055,.54,'wood',0,.08)
      box(g,.86,.055,.54,'wood',0,.90)
      box(g,.055,.82,.54,'wood',-.43,.49)
      box(g,.055,.82,.54,'wood',.43,.49)
      box(g,.80,.78,.035,'wood',0,.49,-.255)
      for(const y of [.145,.38,.615,.85])box(g,.80,.024,.50,'wood',0,y,-.02)
      for(let j=0;j<3;j++){
        const drawer=new THREE.Group();drawer.position.set(0,.26+j*.235,0);drawer.userData.lid=1;drawer.userData.part='drawer';drawer.userData.idx=2-j;drawer.userData.bz=0;g.add(drawer)
        box(drawer,.79,.19,.035,'walnut',0,0,.29)
        box(drawer,.75,.025,.45,'wood',0,-.075,.045)
        box(drawer,.025,.15,.45,'wood',-.365,0,.045);box(drawer,.025,.15,.45,'wood',.365,0,.045)
        box(drawer,.75,.15,.025,'wood',0,0,-.18)
        for(const x of [-.25,.25])torus(drawer,.035,.007,x,.02,.33,'gold')
      }
      box(g,1.02,.055,.64,'marble',0,.91)
      for(const x of [-.42,.42])box(g,.055,1.28,.055,'wood',x,1.54,-.18)
      box(g,.88,.05,.07,'wood',0,2.18,-.18)
      box(g,.77,1.10,.018,'steel',0,1.58,-.17);break
    }
    case 'loungechair': chair(g,0,0,Number(s.data?.deg??0)*Math.PI/180);break
    case 'lightgrid': {
      if(!['maintenance','guestroom','gym','pool','boilerroom','beverly'].includes(profile))return null
      if(profile==='maintenance'){
        box(g,.64,.045,.64,'steel',0,H-.03);mesh(g,new THREE.BoxGeometry(.59,.017,.59),glow,0,H-.057)
      }else if(profile==='boilerroom'){
        cyl(g,.023,.30,'blackSteel',0,H-.15);mesh(g,new THREE.ConeGeometry(.24,.15,20,1,true),'steel',0,H-.32).rotation.z=Math.PI
        mesh(g,new THREE.SphereGeometry(.09,12,8),glow,0,H-.36)
      }else{cyl(g,.30,.10,'bronze',0,H-.10);const b=mesh(g,new THREE.SphereGeometry(.275,20,10),glow,0,H-.17);b.scale.y=.35}
      break
    }
    case 'wallsign': {
      if(!s.data?.silver&&!s.data?.staff)return null
      box(g,.74,.22,.03,s.data?.silver?'steel':'blackSteel',0,2.03)
      mesh(g,new THREE.PlaneGeometry(.7,.175),label(String(s.data.text??'贝弗莉室'),!!s.data.silver),0,2.03,.022);break
    }
    case 'cabinet': {
      if(profile!=='maintenance')return null
      // Hollow maintenance cabinet with two independently hinged leaves.
      box(g,.84,.055,.47,'steel',0,.05)
      box(g,.84,.055,.47,'steel',0,1.75)
      box(g,.055,1.70,.47,'steel',-.42,.90)
      box(g,.055,1.70,.47,'steel',.42,.90)
      box(g,.76,1.70,.035,'steel',0,.90,-.22)
      for(const y of [.30,.72,1.14,1.56])box(g,.75,.025,.39,'steel',0,y,-.02)
      const leaves: readonly [string, number, number][] = [['doorL',-.42,-1],['doorR',.42,1]]
      for(const [part,x,sign] of leaves){
        const door=new THREE.Group();door.position.set(x,0,.253);door.userData.lid=1;door.userData.part=part;g.add(door)
        box(door,.416,1.62,.035,'steel',-sign*.208,.91,0)
        for(let i=0;i<8;i++)box(door,.30,.014,.016,'blackSteel',-sign*.208,1.32+i*.04,.029)
        box(door,.025,.15,.038,'blackSteel',-sign*.36,1.02,.037)
        if(sign<0)mesh(door,new THREE.PlaneGeometry(.30,.10),label('配电 · 380V'),.208,.95,.024)
      }
      break
    }
    case 'hotelwindow': {
      if(profile!=='serviceLift'&&profile!=='guestroom')return null
      if(profile==='guestroom'){
        box(g,1.6,1.8,.08,'wood',0,1.72)
        box(g,1.4,1.58,.028,'linen',0,1.72,.055)
        for(const x of [-.68,-.34,0,.34,.68])box(g,.045,1.63,.045,'wood',x,1.72,.09)
        for(const y of [1,1.45,1.92,2.46])box(g,1.4,.045,.045,'wood',0,y,.10)
      }else{
        box(g,1.04,2.48,.12,'steel',0,1.24)
        for(const x of [-.24,.24])box(g,.455,2.2,.035,'steel',x,1.14,.085)
        box(g,.014,2.2,.022,'blackSteel',0,1.14,.111)
        mesh(g,new THREE.PlaneGeometry(.74,.17),label('维修电梯 · 停用'),0,2.39,.085)
        box(g,.10,.25,.055,'steel',.62,1.1,.04);cyl(g,.022,.02,'gold',.62,1.1,.084).rotation.x=Math.PI/2
      }break
    }
    case 'hoteldoor': {
      if(!['maintenance','boilerroom','beverly'].includes(profile))return null
      g.rotation.y=doorNeedsRotate(m,s);const service=profile!=='beverly',trim: L5Surface=service?'steel':'ivory'
      for(const x of [-.47,.47])box(g,.10,2.35,.23,trim,x,1.175)
      box(g,1.04,.12,.24,trim,0,2.35)
      if(H>2.41)box(g,1.04,H-2.41,.22,service?'whitePaint':'ballroomPanel',0,(H+2.41)/2)
      const leaf=new THREE.Group();leaf.position.x=-.41;leaf.userData.lid=1;g.userData.swing=1;g.add(leaf)
      box(leaf,.82,2.28,.068,service?'steel':'ballroomPanel',.41,1.14)
      for(const sign of [-1,1]){
        if(service){box(leaf,.77,.10,.025,'blackSteel',.41,.86,sign*.048);box(leaf,.77,.19,.02,'steel',.41,.15,sign*.047)}
        else for(const y of [.5,1.65]){box(leaf,.62,.57,.018,'ivory',.41,y,sign*.049);box(leaf,.55,.5,.026,'ballroomPanel',.41,y,sign*.061)}
        box(leaf,.035,.24,.043,service?'blackSteel':'gold',.71,1.05,sign*.065)
        const p=mesh(leaf,new THREE.PlaneGeometry(.63,.158),label(service?(s.data?.staff?'仅供员工使用':'锅炉房'): '贝弗莉室',!service),.41,1.87,sign*.052);if(sign<0)p.rotation.y=Math.PI
      }
      break
    }
    case 'ceilingbeam': {
      if(profile!=='portal')return null
      const steel=s.data?.room==='maintenance'||s.data?.room==='boilerroom',mat=steel?'steel':'wood'
      if(s.data?.axis==='y')g.rotation.y=Math.PI/2
      const hasDoor=m.structures.some(d=>d.x===s.x&&d.y===s.y&&d.kind==='hoteldoor')||m.exits?.some(e=>e.x===s.x&&e.y===s.y)
      if(!hasDoor){
        for(const x of [-.47,.47])box(g,.055,2.52,.23,mat,x,1.26)
        box(g,1.0,.09,.24,mat,0,2.52)
      }
      box(g,1,.018,.95,steel?'steel':'marble',0,.012)
      break
    }
    case 'boiler':case 'sphboiler': {
      const radius=Math.min(.82,s.w*.41),length=Math.max(.76,s.h*.85),cy=radius+.26
      const body=cyl(g,radius,length,'boilerPaint',0,cy);body.rotation.x=Math.PI/2
      for(const z of [-length*.5,length*.5]){
        cyl(g,radius*1.045,.075,'rust',0,cy,z).rotation.x=Math.PI/2
        cyl(g,radius*.96,.087,'boilerPaint',0,cy,z+(z<0?-.012:.012)).rotation.x=Math.PI/2
        for(let i=0;i<12;i++){const a=i*Math.PI/6;cyl(g,.027,.04,'rust',Math.cos(a)*radius*.88,cy+Math.sin(a)*radius*.88,z+(z<0?-.068:.068),6).rotation.x=Math.PI/2}
      }
      const front=-length*.5-.105
      cyl(g,radius*.33,.13,'blackSteel',0,cy,front).rotation.x=Math.PI/2
      const motor=cyl(g,radius*.22,.26,'steel',-.13,cy+.07,front-.17);motor.rotation.x=Math.PI/2
      for(let i=0;i<8;i++){const x=-radius*.17+i*radius*.045;box(g,.015,radius*.30,.012,'blackSteel',x-.13,cy+.07,front-.305)}
      for(const z of [-length*.36,length*.36])for(const x of [-radius*.7,radius*.7])box(g,.12,.48,.22,'rust',x,.25,z)
      pipe(g,[[0,cy+radius*.75,length*.20],[0,H-.55,length*.20],[.55,H-.40,length*.20]],radius*.23)
      for(const x of [-radius*.75,radius*.75])pipe(g,[[x,.18,-length*.35],[x,cy+.4,-length*.35],[x*.6,cy+.4,-length*.50]],.036,'steel')
      const gaugeGroup=new THREE.Group();gaugeGroup.rotation.y=Math.PI;g.add(gaugeGroup);gauge(gaugeGroup,radius*.54,cy+.30,-front-.09)
      box(g,.32,.28,.15,'blackSteel',radius*.85,cy+.30,front*.45)
      // Small service conduits, corrosion bands and dry debris stay within the equipment bay.
      for(const x of [-radius*.65,radius*.65])pipe(g,[[x,.13,-length*.45],[x,.13,length*.5],[x,.55,length*.5]],.025,'rust')
      for(let i=0;i<5;i++){const b=box(g,.12+i*.01,.025,.16,'rust',(i%2?1:-1)*radius*.72,.028,-length*.36+i*length*.18);b.rotation.y=i*.73}
      if(s.data?.gallery)for(const x of [-radius-.08,radius+.08]){
        for(const z of [-length*.42,length*.42])box(g,.025,1.15,.025,'blackSteel',x,.575,z)
        pipe(g,[[x,1.14,-length*.42],[x,1.14,length*.42]],.018,'blackSteel')
      }
      break
    }
    case 'piperack':case 'manifold':case 'pipes': {
      const width=Math.max(.82,s.w*.9),span=Math.max(.6,s.h*.8)
      for(const x of [-width*.44,width*.44])box(g,.055,H-.1,.065,'blackSteel',x,(H-.1)/2,-span*.23)
      for(let i=0;i<3;i++){
        const y=1.0+i*.69,r=i===2?.20:.11
        pipe(g,[[-width*.5,y,-span*.12],[-width*.22,y,-span*.12],[width*.12,y+.20,0],[width*.48,y+.20,0]],r)
        for(const x of [-width*.30,width*.28]){cyl(g,r*1.09,.042,'steel',x,y+(x>0?.20:0),x>0?0:-span*.12).rotation.z=Math.PI/2}
      }
      pipe(g,[[width*.15,.08,.15],[width*.15,1.4,.15],[width*.39,1.62,.15]],.044,'rust')
      wheel(g,-width*.16,1.58,.25,.25);gauge(g,width*.30,2.16,.26)
      if(s.data?.axis==='y')g.rotation.y=Math.PI/2;break
    }
    case 'furnace': {
      box(g,.88,1.55,.77,'blackSteel',0,.82)
      box(g,.71,.75,.045,'rust',0,.92,.41)
      mesh(g,new THREE.PlaneGeometry(.47,.31),ember,0,.86,.438)
      for(let i=0;i<7;i++)box(g,.022,.36,.019,'blackSteel',-.225+i*.075,.86,.46)
      pipe(g,[[0,1.52,0],[0,H-.48,0],[.5,H-.26,0]],.18,'rust')
      for(const x of [-.34,.34])box(g,.08,.18,.64,'steel',x,.09)
      wheel(g,.26,1.26,.47,.10);break
    }
    default:return null
  }
  return g
}
