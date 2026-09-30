import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {Structure,LightSource} from '../core/types'
import type {GameMap} from '../world/mapgen'
import {l4StyleAt} from '../world/l4Layout'
import {l4Material,l4WorldUV,type L4Surface} from './l4Materials'
import {buildL4OfficeDetail} from './l4OfficeDetails'
import {buildL4WallDecor} from './l4WallDecor'
function owned<T extends THREE.Material>(m:T):T{m.userData.l4Owned=true;return m}
const glassCache=new Map<number,THREE.MeshPhysicalMaterial>()
function glassMaterial(opacity:number){let mat=glassCache.get(opacity);if(!mat){mat=new THREE.MeshPhysicalMaterial({color:'#93b5bf',opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,roughness:.2,metalness:.03});glassCache.set(opacity,mat)}return mat}
const blackWindowMaterial=new THREE.MeshStandardMaterial({color:'#101314',roughness:.96,side:THREE.DoubleSide})
const screenMaterial=new THREE.MeshBasicMaterial({color:'#1b252a'})
export function disposeL4Owned(o:THREE.Object3D){
  const material=(o as THREE.Mesh).material
  if(!material)return
  for(const m of Array.isArray(material)?material:[material])if(m.userData.l4Owned&&!m.userData.l4Disposed){m.dispose();m.userData.l4Disposed=true}
}
/* Window wetness is subtle; clouds now exist in the exterior 3D volume. */
const mist=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
  vertexShader:`varying vec3 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`varying vec3 p;
    float h(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    void main(){vec2 v=vec2(p.x+p.z,p.y)*1.3;float cloud=n(v)*.6+n(v*2.7)*.25+n(v*7.1)*.15;float track=step(.98,fract((p.x+p.z)*9.31))*smoothstep(.55,.8,n(vec2(floor((p.x+p.z)*9.31),p.y*6.)));gl_FragColor=vec4(vec3(.32,.40,.44)+track*.18,.035+cloud*.07+track*.18);}`,
})
function part(g:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,s:L4Surface){
  const geo=s==='chair'?new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.3):new THREE.BoxGeometry(w,h,d);l4WorldUV(geo,0,0,s==='fabric'||s==='chair'?3:1)
  const mesh=new THREE.Mesh(geo,l4Material(s));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh
}
function chair(g:THREE.Object3D,x=0,z=0){
  part(g,.48,.1,.45,x,.47,z,'chair');const back=part(g,.47,.44,.10,x,.79,z+.21,'chair');back.rotation.x=-.10
  part(g,.055,.36,.07,x,.23,z,'frame')
  for(const sign of [-1,1]){part(g,.04,.19,.04,x+sign*.28,.57,z+.08,'frame');part(g,.07,.045,.28,x+sign*.28,.68,z,'frame')}
  for(let n=0;n<5;n++){const a=n*Math.PI*2/5,leg=part(g,.045,.05,.34,x+Math.sin(a)*.15,.1,z+Math.cos(a)*.15,'frame');leg.rotation.y=a;part(g,.065,.07,.08,x+Math.sin(a)*.30,.055,z+Math.cos(a)*.30,'frame')}
}
function desk(g:THREE.Object3D,w:number,computer:boolean){
  part(g,w,.055,.72,0,.74,0,'desk')
  for(const x of [-w/2+.08,w/2-.08])part(g,.07,.70,.6,x,.35,0,'frame')
  if(computer){
    part(g,.38,.04,.23,0,.79,-.12,'frame');part(g,.06,.16,.06,0,.88,-.17,'frame')
    part(g,.51,.35,.10,0,1.10,-.2,'frame')
    const screen=part(g,.46,.29,.015,0,1.10,-.142,'frame');screen.material=screenMaterial
    part(g,.43,.025,.15,0,.786,.19,'frame');part(g,.16,.44,.40,w*.30,.25,-.03,'frame')
    // Keyboard key rows at the correct desk scale.
    for(let r=0;r<4;r++)part(g,.39,.008,.012,0,.803,.14+r*.029,'trim')
  }
}
const labelMaterials=new Map<string,THREE.MeshBasicMaterial>()
function label(g:THREE.Group,text:string,x:number,y:number,z:number,w=.55,h=.17){
  let mat=labelMaterials.get(text)
  if(!mat){const cv=document.createElement('canvas');cv.width=512;cv.height=128;const c=cv.getContext('2d')!;c.fillStyle='#62685f';c.fillRect(0,0,512,128);c.fillStyle='#e0ded0';c.font='44px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,66);const map=new THREE.CanvasTexture(cv);map.colorSpace=THREE.SRGBColorSpace;mat=new THREE.MeshBasicMaterial({map});labelMaterials.set(text,mat)}
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);plate.position.set(x,y,z);g.add(plate)
}
export function buildL4Structure(s:Structure):THREE.Group|null {
  const g=new THREE.Group(),kind=s.kind
  if(kind==='l4prop'){
    const detail=String(s.data?.detail) as Parameters<typeof buildL4OfficeDetail>[0]
    const model=String(detail)==='wallDecor'?buildL4WallDecor(Number(s.data?.sid??0)):buildL4OfficeDetail(detail,Number(s.data?.sid??0));g.add(model)
    if(s.data?.wallOffset)model.position.z=-.485
    g.rotation.y=Number(s.data?.deg??0)*Math.PI/180
  }else if(kind==='cubicle'){
    const sign=Number(s.data?.deg)===270?-1:1
    part(g,.075,1.34,1.97,sign*(s.w/2-.06),.67,0,'fabric')
    for(const z of [-.965,.965]){part(g,s.w-.12,1.34,.075,0,.67,z,'fabric');part(g,s.w-.10,.025,.088,0,1.35,z,'edge');for(const x of [-s.w/2+.07,s.w/2-.07])part(g,.027,1.34,.085,x,.67,z,'edge')}
    part(g,.088,.025,1.97,sign*(s.w/2-.06),1.35,0,'edge')
    const table=new THREE.Group();desk(table,1.75,true);table.add(buildL4OfficeDetail('deskItems',Number(s.data?.sid??0)));table.rotation.y=-sign*Math.PI/2;table.position.x=sign*(s.w/2-.52);g.add(table)
  }else if(kind==='officechair'){
    chair(g);g.rotation.y=Number(s.data?.deg??0)*Math.PI/180
  }else if(kind==='desk'||kind==='table'){
    desk(g,Math.max(.9,s.w-.15),kind==='desk');g.add(buildL4OfficeDetail('deskItems',Number(s.data?.sid??0)));g.rotation.y=Number(s.data?.deg??0)*Math.PI/180
  }else if(kind==='pillar'){
    part(g,.47,2.9,.47,0,1.45,0,'wall');part(g,.50,.11,.50,0,.055,0,'trim')
  }else if(kind==='glasswin'||kind==='windowblack'||kind==='windowtrap'){
    const partition=!!s.data?.partition,z=partition?0:.39,bottom=partition?.12:.87,top=partition?2.9:2.64
    const inner=new THREE.Group();g.add(inner);g.rotation.y=Number(s.data?.deg??0)*Math.PI/180
    if(!partition){part(inner,1,.86,.22,0,.43,z,'wall');part(inner,1,.26,.22,0,2.77,z,'wall');part(inner,1,.055,.30,0,.87,z-.03,'frame');part(inner,1,.11,.23,0,.055,z,'trim')}
    if(!partition){
      part(inner,1,.16,1,0,2.82,0,'wall')
      for(const side of [-1,1])if(s.data?.[side<0?'revealLeft':'revealRight']){
        part(inner,.045,2.9,1,side*.478,1.45,0,'wall')
        part(inner,.055,2.9,.035,side*.478,1.45,-.485,'edge')
        part(inner,.055,.11,1,side*.478,.055,0,'trim')
      }
    }
    for(const x of partition?[-.475,.475]:s.data?.mullion?[-.475]:[])part(inner,.05,top-bottom,.09,x,(bottom+top)/2,z,'frame')
    for(const y of [bottom,top,...(partition?[2.42]:[])])part(inner,1,.045,.10,0,y,z,'frame')
    const mat=kind==='windowblack'?blackWindowMaterial:glassMaterial(partition?.11:.17)
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(partition?.94:1,top-bottom),mat);pane.position.set(0,(bottom+top)/2,z);g.add(pane)
    if(partition&&Number(s.data?.sid??0)%3!==0){const blinds=buildL4OfficeDetail('blinds');blinds.position.z=-.065;g.add(blinds)}
    if(!partition&&kind!=='windowblack'){
      const haze=new THREE.Mesh(new THREE.PlaneGeometry(1,top-bottom),mist);haze.position.set(0,(bottom+top)/2,z-.012);g.add(haze)
      // Wet tracks are in the shared pane shader, not nine transparent meshes.
    }
  }else if(kind==='hoteldoor'||kind==='glassdoor'){
    g.rotation.y=s.data?.axis==='y'?Math.PI/2:0
    for(const x of [-.47,.47])part(g,.06,2.9,.16,x,1.45,0,'door')
    part(g,1,.62,.16,0,2.59,0,'wall');part(g,1,.055,.18,0,2.26,0,'door')
    const names:Record<string,string>={pantry:'茶水间',toilet:'洗手间',server:'设备间',archive:'档案室',printer:'打印室'}
    label(g,names[String(s.data?.room)]??(kind==='glassdoor'?'会议室':'OFFICE '+(100+Number(s.data?.sid??0)%90)),0,2.47,.086)
    if(kind==='hoteldoor'){
      const pivot=new THREE.Group();pivot.position.x=-.435;pivot.userData.lid=1;g.add(pivot)
      part(pivot,.87,2.20,.055,.435,1.10,0,'door')
      part(pivot,.035,.14,.03,.77,1.02,.05,'frame');part(pivot,.12,.025,.035,.72,1.04,.08,'frame')
    }else{
      const panel=new THREE.Group();panel.userData.lid=1;g.add(panel)
      const glass=new THREE.Mesh(new THREE.PlaneGeometry(.86,2.2),glassMaterial(.14));glass.position.y=1.1;panel.add(glass)
      for(const x of [-.43,.43])part(panel,.035,2.2,.045,x,1.1,0,'frame')
      part(panel,.035,.40,.05,.30,1.10,.06,'frame')
    }
  }else if(kind==='l4stairs'){
    // Two opposed height directions, sharing the same landing and loop identity.
    for(const [x,sign]of [[-1,1],[1,-1]])for(let n=0;n<16;n++){
      const height=sign*(n+1)*.175,z=-2.05+n*.28
      part(g,1.65,.16,.29,x,height-.08,z,'wall');part(g,1.65,.016,.035,x,height+.008,z-.125,'trim')
      for(const side of [-.86,.86])if(n%3===0)part(g,.035,.88,.035,x+side,height+.44,z,'frame')
    }
    for(const x of [-1.94,0,1.94])part(g,.09,8.9,6,x,1.45,0,'wall')
    part(g,4,8.9,.12,0,1.45,2.95,'wall');part(g,4,.15,6,0,5.90,0,'ceiling');part(g,4,.15,6,0,-3.05,0,'floor')
  }else return null
  return g
}
export function buildL4Lights(m:GameMap,g:THREE.Group,lights:LightSource[],fixtures:{mat:THREE.MeshBasicMaterial;seed:number;src?:LightSource;batch?:THREE.InstancedMesh;index?:number}[]){
  const styles=['officehall','open','smallrooms','windowview']
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),position=new THREE.Vector3()
  for(const style of styles){
    const sources=lights.filter(l=>!l.noFix&&l4StyleAt(m,l.x,l.y)===style);if(!sources.length)continue
    const strip=style==='windowview',open=style==='open',w=strip?3.9:open?1.18:1.25,d=strip?.032:open?.59:.27
    rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),style==='officehall'?Math.PI/2:0)
    const frame=new THREE.InstancedMesh(new THREE.BoxGeometry(w+.045,.045,d+.045),l4Material('edge'),sources.length)
    const mat=owned(new THREE.MeshBasicMaterial({color:'white'}));mat.userData.base=new THREE.Color(strip?'#dccab0':'#fffef2')
    const emit=new THREE.InstancedMesh(new THREE.BoxGeometry(w,.024,d),mat,sources.length)
    emit.name='l4-instanced-fixtures';frame.name='l4-instanced-fixture-frames'
    for(let i=0;i<sources.length;i++){
      const src=sources[i];position.set(src.x,2.865,src.y);matrix.compose(position,rotation,scale);frame.setMatrixAt(i,matrix)
      position.y=2.832;matrix.compose(position,rotation,scale);emit.setMatrixAt(i,matrix);emit.setColorAt(i,mat.userData.base)
      fixtures.push({mat,seed:src.flickerSeed,src,batch:emit,index:i})
    }
    frame.instanceMatrix.needsUpdate=true;emit.instanceMatrix.needsUpdate=true
    frame.computeBoundingSphere();emit.computeBoundingSphere();g.add(frame,emit)
  }
}

