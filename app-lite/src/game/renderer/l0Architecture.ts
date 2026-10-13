import {buildL0FixtureParts} from './l0Fixtures'
import {l0LayoutEnvironment} from '../world/l0Regions'
import {createL0FlickerSampler,l0FlickerTime} from './l0Flicker'
import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {getMaterialMode,levelTexture,litMaterial,noiseTexture} from './shared'
import {L0_HEIGHT,l0WoodRects,type L0Layout,type L0Rect} from '../world/l0Architecture'
import {createL0LightSampler} from './l0LightingBake'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {exposedL0WallFaces} from '../world/l0WallFaces'
import {l0TrimWalls,l0OutletPositions} from '../world/l0WallDetails'
import {l0StaticPointMask} from './l0PointMask'
const inside=(r:L0Rect,x:number,y:number)=>x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h
function tex(name:string,data=false){const t=levelTexture('l0-remake/'+name+'.png',()=>noiseTexture(data?'#8080ff':'#a49e74',data?'#8080ff':'#b2ac86'));t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;return t}
function material(name:string,baked=true){
 const real=getMaterialMode()==='realistic',trim=name.endsWith('trim'),frame=name==='fixture-frame'||name==='black-frame',paint=name==='khaki'||name==='rubber'||name==='bin-red'||name==='can-metal',source=trim||frame||paint?'cream':name,map=tex(source),carpet=name.includes('carpet')
 const normal=trim?.015:frame?.02:name==='cream'?.035:carpet?.045:name==='wood'?.08:.12
 const tint=trim?(name==='red-trim'?'#843c2f':name==='arch-trim'?'#c8bfab':'#d2c295'):frame?(name==='black-frame'?'#181916':'#e1e0d5'):name==='khaki'?'#d9ceb0':name==='rubber'?'#24231f':name==='bin-red'?'#762e28':name==='can-metal'?'#aaa99a':'#ffffff'
 const m=litMaterial({map,color:tint,normalMap:tex(source+'-normal',true),normalScale:new THREE.Vector2(normal,normal),roughnessMap:real?tex(source+'-rough',true):undefined,roughness:carpet?1:name==='wood'?.92:frame?.67:.94,metalness:frame?.28:0,envBase:carpet?.005:name==='wood'?.018:.025,vertexColors:false,emissive:baked?tint:'#000000',emissiveMap:baked?map:undefined,emissiveIntensity:baked?(frame?.4:.72):0})
 if(name==='can-metal'&&m instanceof THREE.MeshStandardMaterial){m.metalness=.65;m.roughness=.48}
 // Static fixture contribution is baked with wall visibility. Handheld/dropped lights remain live.
 if(baked){
  const previous=m.onBeforeCompile.bind(m),blend=name==='wall'||name==='dots'||name==='carpet'||name==='ceiling'
  m.onBeforeCompile=(s,r)=>{
   previous(s,r);s.uniforms.l0StaticPointMask=l0StaticPointMask;s.uniforms.l0FlickerTime=l0FlickerTime
   s.vertexShader='attribute vec3 color;attribute vec2 l0Surface;attribute vec4 l0Flicker;varying vec3 vL0Baked;varying vec2 vL0Surface;varying vec4 vL0Flicker;varying float vL0Height;\n'+s.vertexShader
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vL0Baked=color;vL0Surface=l0Surface;vL0Flicker=l0Flicker;vL0Height=transformed.y;')
   s.fragmentShader='uniform float l0StaticPointMask[128],l0FlickerTime;varying vec3 vL0Baked;varying vec2 vL0Surface;varying vec4 vL0Flicker;varying float vL0Height;\n'+s.fragmentShader
   if(blend){
    s.uniforms.l0RedMap={value:tex(name==='carpet'?'red-carpet':name==='ceiling'?'red-ceiling':'red')};s.uniforms.l0ArchMap={value:tex(name==='carpet'?'arch-carpet':name)}
    s.fragmentShader='uniform sampler2D l0RedMap,l0ArchMap;\n'+s.fragmentShader
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec4 l0SurfaceColor=mix(texture2D(map,vMapUv),texture2D(l0RedMap,vMapUv),vL0Surface.x);
     l0SurfaceColor=mix(l0SurfaceColor,texture2D(l0ArchMap,vMapUv),vL0Surface.y);
     diffuseColor.rgb=diffuse*l0SurfaceColor.rgb;`)
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance=emissive*l0SurfaceColor.rgb;')
   }
   s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance *= vL0Baked;')
   // The blended map assignment above must keep the baked irradiance too.
   if(blend)s.fragmentShader=s.fragmentShader.replace('totalEmissiveRadiance=emissive*l0SurfaceColor.rgb;','totalEmissiveRadiance=emissive*l0SurfaceColor.rgb*vL0Baked;')
   if(name==='trim'){
    // The baseboard follows the same spatial dye as its wall, including the
    // gradual red boundary. Keep the exterior of enclosure walls yellow.
    const ratio=(color:string)=>{const c=new THREE.Color(color),base=new THREE.Color(tint);return new THREE.Vector3(c.r/base.r,c.g/base.g,c.b/base.b)}
    s.uniforms.l0TrimRed={value:ratio('#843c2f')}
    s.uniforms.l0TrimArch={value:ratio('#c8bfab')}
    s.fragmentShader='uniform vec3 l0TrimRed,l0TrimArch;\n'+s.fragmentShader
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n vec3 l0TrimDye=mix(mix(vec3(1.),l0TrimRed,vL0Surface.x),l0TrimArch,vL0Surface.y);diffuseColor.rgb*=l0TrimDye;')
    s.fragmentShader=s.fragmentShader.replace('totalEmissiveRadiance *= vL0Baked;','totalEmissiveRadiance *= vL0Baked*l0TrimDye;')
   }
   s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    float l0Phase=vL0Flicker.y;
    float l0Voltage=sin(l0FlickerTime*4.900884+l0Phase)+.28*sin(l0FlickerTime*17.3+l0Phase*2.1)*sin(l0FlickerTime*6.7+l0Phase);
    float l0Power=mix(.012,1.,smoothstep(-.24,-.12,l0Voltage));
    vec2 l0Rect=abs(vec2(vL0Flicker.z,vL0Height-1.18))-vec2(.52,1.02);
    float l0Edge=length(max(l0Rect,0.))+min(max(l0Rect.x,l0Rect.y),0.);
    float l0Patch=(1.-smoothstep(-.10,.10,l0Edge))*smoothstep(.8,.99,vL0Flicker.w);
    totalEmissiveRadiance+=diffuseColor.rgb*(vL0Flicker.x+2.1*l0Patch)*l0Power;`)
   s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace('getPointLightInfo( pointLight, geometryPosition, directLight );','getPointLightInfo( pointLight, geometryPosition, directLight );\n directLight.color *= 1.0 - l0StaticPointMask[i];'))
  }
  // Texture names and tint values are uniforms, not shader variants. Sharing
  // this key avoids compiling the same program for every architectural finish.
  m.customProgramCacheKey=()=>`l0-bake-v7-${real}-${blend}-${name==='trim'}`
 }
 m.name='l0-'+name;m.userData.l0Owned=true;return m
}
/** Streaming generator: bounded batches, owned materials/geometries, shared images. */
export function* buildL0Architecture(a:L0Layout,ox:number,oy:number,root:THREE.Group,neighbours:L0Layout[]=[]):Generator<void>{
 const groups=new Map<string,THREE.BufferGeometry[]>(),light=createL0LightSampler(a,neighbours),flicker=createL0FlickerSampler([a,...neighbours]),environment=new Map<string,ReturnType<typeof l0LayoutEnvironment>>()
 const environmentAt=(x:number,z:number)=>{const key=`${x.toFixed(4)},${z.toFixed(4)}`;let e=environment.get(key);if(!e){e=l0LayoutEnvironment(a,x,z);environment.set(key,e)}return e}
 function add(g:THREE.BufferGeometry,name:string,bake=true,forceYellow=false,fixture?:{light:number;red:number;arch:number}){
  // ExtrudeGeometry is non-indexed; Box/PlaneGeometry are indexed. Mixing them
  // makes mergeGeometries reject the entire material bucket (including arches).
  if(!g.index)g.setIndex(Array.from({length:g.getAttribute('position').count},(_,i)=>i))
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),c=new Float32Array(p.count*3),field=new Float32Array(p.count*2),flash=new Float32Array(p.count*4)
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),z=p.getZ(i),h=p.getY(i),nx=n.getX(i),nz=n.getZ(i),top=Math.abs(n.getY(i))>.5
   const scale=name==='wall'||name==='red'?.8:name==='manila'?1.05:name==='ceiling'?1/1.2:name==='wood'?1/1.7:name.includes('carpet')?1/3:.75
   uv.setXY(i,(top?x:Math.abs(nx)>.5?z:x)*scale,(top?z:h)*scale)
   if(top&&name==='wood')uv.setXY(i,z/1.7,x/1.7)
   if(top&&name.endsWith('ceiling'))uv.setXY(i,x/1.2,z/.6)
   const ceilingK=name==='ceiling'?(a.wood&&inside(a.wood,x,z)?.8:.36):1
   const v=(fixture?.light??(bake?light(x,z,h,nx,n.getY(i),nz):1))*ceilingK;c.set([v,v,v],i*3)
   const e=fixture??environmentAt(x,z);field.set([forceYellow?0:e.red,name==='carpet'||name==='trim'?e.arch:0],i*2)
   flash.set(flicker(x,z,h,nx,n.getY(i),nz),i*4)
   p.setXYZ(i,x-ox,h,z-oy)
  }
  g.setAttribute('l0Surface',new THREE.BufferAttribute(field,2));g.setAttribute('l0Flicker',new THREE.BufferAttribute(flash,4));g.setAttribute('color',new THREE.BufferAttribute(c,3));const list=groups.get(name)??[];list.push(g);groups.set(name,list)
 }
 function box(x:number,y:number,z:number,w:number,h:number,d:number,name:string,bake=true,exterior?:string,redFace?:string){
  const step=h>.4?.5:1
  const g=new THREE.BoxGeometry(w,h,d,Math.max(1,Math.ceil(w/step)),Math.max(1,Math.ceil(h/step)),Math.max(1,Math.ceil(d/step)));g.translate(x+w/2,y+h/2,z+d/2)
  if(!redFace&&(!exterior||!a.wood)){add(g,name,bake);return}
  // The thick Manila wall has wallpaper inside and yellow paper outside.
  // Keep the doorway reveals in the interior finish, on the same solid wall.
  const flat=g.toNonIndexed(),p=flat.getAttribute('position'),n=flat.getAttribute('normal'),room=a.wood??{x:0,y:0,w:0,h:0}
  for(const face of flat.groups){
   const i=face.start,px=p.getX(i),pz=p.getZ(i),nx=n.getX(i),nz=n.getZ(i)
   const outer=(nx<-.5&&px<room.x-.5)||(nx>.5&&px>room.x+room.w+.5)||(nz<-.5&&pz<room.y-.5)||(nz>.5&&pz>room.y+room.h+.5)
   const part=new THREE.BufferGeometry()
   for(const key of ['position','normal','uv']){const attr=flat.getAttribute(key);part.setAttribute(key,new THREE.Float32BufferAttribute(Array.from(attr.array.slice(face.start*attr.itemSize,(face.start+face.count)*attr.itemSize)),attr.itemSize))}
   const redInside=redFace==='px'?nx>.5:redFace==='nx'?nx<-.5:redFace==='pz'?nz>.5:redFace==='nz'?nz<-.5:false
   add(part,redFace?(redInside?'red':'wall'):outer?exterior!:name,bake)
  }
  flat.dispose();g.dispose()
 }
 try{
 const X=a.cx*32,Y=a.cy*32
 const woods=l0WoodRects(a)
 // Rows are built directly into buffers, avoiding thousands of temporary
 // PlaneGeometry objects. Split exactly at doorway flooring boundaries.
 const boundaries=[...woods,...a.pits,...(a.redZones??[]).flatMap(({bounds:r})=>[r,{x:r.x+.26,y:r.y+.26,w:r.w-.52,h:r.h-.52}])]
 const cuts=(origin:number,axis:'x'|'y',span:'w'|'h')=>[...new Set([...Array.from({length:33},(_,i)=>origin+i),...boundaries.flatMap(r=>[r[axis],r[axis]+r[span]]).filter(v=>v>origin&&v<origin+32)])].sort((a,b)=>a-b)
 const xs=cuts(X,'x','w'),zs=cuts(Y,'y','h')
 for(let zi=0;zi<zs.length-1;zi++){
  const buffers=new Map<string,{p:number[];n:number[];uv:number[];ix:number[]}>()
  for(let xi=0;xi<xs.length-1;xi++){
   const x=xs[xi],z=zs[zi],w=xs[xi+1]-x,d=zs[zi+1]-z,mx=x+w/2,mz=z+d/2
   if(a.pits.some(r=>inside(r,mx,mz)))continue
   const depth=-(a.puddles.find(r=>inside(r,mx,mz))?.depth??0)
   const name=woods.some(r=>inside(r,mx,mz))?'wood':'carpet'
   const b=buffers.get(name)??{p:[],n:[],uv:[],ix:[]},start=b.p.length/3
   b.p.push(x,depth,z,x,depth,z+d,x+w,depth,z+d,x+w,depth,z)
   b.n.push(0,1,0,0,1,0,0,1,0,0,1,0);b.uv.push(0,0,0,1,1,1,1,0);b.ix.push(start,start+1,start+2,start,start+2,start+3);buffers.set(name,b)
  }
  for(const [name,b]of buffers){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setIndex(b.ix);add(g,name)}
  if(zi%2===1)yield
 }
 const ceilX=[...new Set([X,...Array.from({length:16},(_,i)=>X+(i+1)*2),...boundaries.flatMap(r=>[r.x,r.x+r.w])])].filter(v=>v>=X&&v<=X+32).sort((a,b)=>a-b)
 const ceilZ=[...new Set([Y,...Array.from({length:16},(_,i)=>Y+(i+1)*2),...boundaries.flatMap(r=>[r.y,r.y+r.h])])].filter(v=>v>=Y&&v<=Y+32).sort((a,b)=>a-b)
 for(let zi=0;zi<ceilZ.length-1;zi++){
  for(let xi=0;xi<ceilX.length-1;xi++){
   const x=ceilX[xi],z=ceilZ[zi],w=ceilX[xi+1]-x,d=ceilZ[zi+1]-z
   const ceil=new THREE.PlaneGeometry(w,d);ceil.rotateX(Math.PI/2);ceil.translate(x+w/2,L0_HEIGHT,z+d/2);add(ceil,a.wood&&inside(a.wood,x+w/2,z+d/2)?'manila-ceiling':'ceiling')
  }yield
 }
 // Emit the boundary of the union, never overlapping BoxGeometry walls.
 const neighbourWalls=neighbours.flatMap(n=>n.walls),trimWalls=l0TrimWalls(a.seed,[...a.walls,...neighbourWalls])
 for(const f of exposedL0WallFaces(a.walls,neighbourWalls)){
  const {wall:w,axis,sign,at,u,v}=f
  const inward=w.redFace===(axis===0?(sign>0?'px':'nx'):(sign>0?'pz':'nz'))
  const outer=w.surface==='manila'&&a.wood&&(axis===0?(sign<0?at<a.wood.x-.4:at>a.wood.x+a.wood.w+.4):axis===2?(sign<0?at<a.wood.y-.4:at>a.wood.y+a.wood.h+.4):false)
  const name=w.redFace?(inward?'red':'wall'):outer?'wall':w.surface
  const emit=(height:number,base:number,material:string,offset=0)=>{
   const step=a.reference?.5:.8
   const g=new THREE.PlaneGeometry(f.w,height,Math.max(1,Math.ceil(f.w/step)),Math.max(1,Math.ceil(height/(a.reference?.4:.6))))
   if(axis===0){g.rotateY(sign*Math.PI/2);g.translate(at+sign*offset,base+height/2,u+f.w/2)}
   else if(axis===1){g.rotateX(-sign*Math.PI/2);g.translate(u+f.w/2,at+sign*offset,base+height/2)}
   else{if(sign<0)g.rotateY(Math.PI);g.translate(u+f.w/2,base+height/2,at+sign*offset)}
   add(g,material,true,!!w.redFace&&!inward)
  }
  emit(f.h,v,name)
  if(axis!==1&&v<.07&&v+f.h>0&&w.surface==='manila'&&!outer)emit(Math.min(.07,v+f.h)-Math.max(0,v),Math.max(0,v),'wood',.006)
  // Intermittent low wall moulding floats above the carpet; no continuous
  // yellow-room skirting remains. Keep it off the arch piers and red enclosure.
  if(axis!==1&&trimWalls.has(w)&&(name==='wall'||name==='dots')&&v<=.18&&v+f.h>=.205)emit(.025,.18,'trim',.0006)
  yield
 }
 // Two grounded receptacles, bevelled plate, screw heads and recessed slots.
 // All hardware joins existing material buckets, including at close range.
 for(const socket of l0OutletPositions(a)){
  const x=0,z=0,y=.335,parts:{g:THREE.BufferGeometry;name:string}[]=[]
  const outletAdd=(g:THREE.BufferGeometry,name:string)=>parts.push({g,name})
  const outletBox=(x:number,y:number,z:number,w:number,h:number,d:number,name:string)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x+w/2,y+h/2,z+d/2);outletAdd(g,name)}
  const plate=new RoundedBoxGeometry(.086,.138,.012,1,.006);plate.translate(x,y,z);outletAdd(plate,'cream')
  for(const sy of [-.034,.034]){
   const face=new RoundedBoxGeometry(.054,.047,.007,1,.010);face.translate(x,y+sy,z+.008);outletAdd(face,'cream')
   for(const sx of [-.012,.012])outletBox(x+sx-.0025,y+sy+.001,z+.012,.005,.016,.002,'pit')
   const ground=new THREE.CircleGeometry(.004,6);ground.translate(x,y+sy-.012,z+.014);outletAdd(ground,'pit')
  }
  for(const sy of [-.059,0,.059]){const screw=new THREE.CircleGeometry(.0032,6);screw.translate(x,y+sy,z+.013);outletAdd(screw,'pit');outletBox(x-.002,y+sy-.0004,z+.014,.004,.0008,.001,'cream')}
  for(const {g,name}of parts){g.rotateY(Math.atan2(socket.nx,socket.ny));g.translate(socket.x+socket.nx*.008,0,socket.y+socket.ny*.008);add(g,name)}
 }
 for(const p of a.pits){const dark=new THREE.Mesh(new THREE.PlaneGeometry(p.w,p.h),new THREE.MeshBasicMaterial({color:'#020201'}));dark.rotation.x=-Math.PI/2;dark.position.set(p.x+p.w/2-ox,-9,p.y+p.h/2-oy);root.add(dark);yield}
 for(const arch of a.arches){
  const shape=new THREE.Shape(),w=arch.length,r=w/2,top=2.28,cy=1.34;
  shape.moveTo(0,top);shape.lineTo(w,top);shape.lineTo(w,cy);
  for(let i=0;i<=16;i++){const t=i/16*Math.PI;shape.lineTo(r+Math.cos(t)*r,cy+Math.sin(t)*.77)}shape.lineTo(0,top);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.36,bevelEnabled:false,curveSegments:12});g.rotateY(-Math.PI/2);g.translate(arch.x+.36,0,arch.y);add(g,'cream');yield
 }
 if(a.baseRegion==='arch'){
  // Reference left wall: two upper dark bumper rails and a lower khaki rail.
  for(const h of [1.65,2.05])box(X+13.602,h,Y+14.78,.018,.027,14.70,'rubber')
  box(X+13.602,.17,Y+14.78,.020,.055,14.70,'khaki')
 }
 for(const p of a.props??[]){
  const cylinder=(rt:number,rb:number,h:number,y:number,name:string,open=false,inner=false)=>{
   const g=new THREE.CylinderGeometry(rt,rb,h,16,1,open)
   if(inner){const index=g.index!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b)}g.computeVertexNormals()}
   g.translate(p.x,y,p.y);add(g,name)
  }
  const ring=(r:number,y:number,name:string,t=.012)=>{const g=new THREE.TorusGeometry(r,t,4,16);g.rotateX(Math.PI/2);g.translate(p.x,y,p.y);add(g,name)}
  const bin=p.kind==='red-bin',name=bin?'bin-red':'can-metal',r=p.radius,h=p.height
  cylinder(r,r*.84,h-.055,h/2-.012,name,true)
  cylinder(r*.82,r*.82,.018,.023,name)
  cylinder(r-.018,r-.018,.016,h-.11,'rubber')
  cylinder(r-.018,r-.034,.09,h-.074,name,true,true)
  // Inset dark mouth and rolled lip preserve the open top at low mesh cost.
  ring(r,h-.025,name,bin?.018:.008);ring(r*.86,.035,name,bin?.013:.006)
  if(bin){
   for(const side of [-1,1])box(p.x+side*(r+.02)-.03,h-.15,p.y-.065,.06,.032,.13,name)
  }else{
   ring(r*.99,h-.07,name,.005)
   const handle=new THREE.TorusGeometry(r+.024,.006,4,12,Math.PI);handle.translate(p.x,h-.065,p.y);add(handle,'can-metal')
  }
  yield
 }
 const lit:THREE.BufferGeometry[]=[],off:THREE.BufferGeometry[]=[]
 for(const l of a.lamps){
  const parts=buildL0FixtureParts(l,L0_HEIGHT)
  // Millimetre-scale grille faces share one irradiance sample. Ray-tracing
  // every bevel vertex was the dominant build cost and added no visible detail.
  const fixture={...environmentAt(l.x,l.y),light:light(l.x,l.y,L0_HEIGHT-.06,0,-1,0)}
  for(const g of parts.frame)add(g,'fixture-frame',true,false,fixture)
  for(const g of parts.recess)add(g,'fixture-frame',true,false,fixture)
  for(const g of parts.diffuser){g.translate(-ox,0,-oy);(l.off?off:lit).push(g)}
  yield
 }
 for(const v of a.vents??[]){
  box(v.x,L0_HEIGHT-.011,v.y,v.w,.008,v.h,'pit')
  const ventPart=(g:THREE.BufferGeometry)=>{add(g,'cream');const c=g.getAttribute('color');for(let i=0;i<c.count;i++)c.setXYZ(i,c.getX(i)*.5,c.getY(i)*.5,c.getZ(i)*.5)}
  for(const [x,z,w,d]of [[v.x-.014,v.y-.014,v.w+.028,.025],[v.x-.014,v.y+v.h-.011,v.w+.028,.025],[v.x-.014,v.y,.025,v.h],[v.x+v.w-.011,v.y,.025,v.h]]){const rim=new THREE.BoxGeometry(w,.034,d);rim.translate(x+w/2,L0_HEIGHT-.025,z+d/2);ventPart(rim)}
  // Angled louvers expose a recessed dark throat from below; one merged batch.
  const count=Math.max(5,Math.round(v.w/.055))
  for(let i=1;i<count;i++){const blade=new THREE.BoxGeometry(.032,.007,v.h-.035);blade.rotateZ(-.48);blade.translate(v.x+v.w*i/count,L0_HEIGHT-.029,v.y+v.h/2);ventPart(blade)}
  box(v.x+.024,L0_HEIGHT-.033,v.y+v.h*.33,v.w-.048,.008,.009,'pit');box(v.x+.024,L0_HEIGHT-.033,v.y+v.h*.67,v.w-.048,.008,.009,'pit')
  for(const x of [v.x+.015,v.x+v.w-.015])for(const z of [v.y+.015,v.y+v.h-.015]){const screw=new THREE.CircleGeometry(.004,6);screw.rotateX(-Math.PI/2);screw.translate(x,L0_HEIGHT-.045,z);add(screw,'pit')}
 }
 for(const [arr,color]of [[lit,a.region==='red'?'#ffdccb':'#fffbee'],[off,'#aaa79b']]as const)if(arr.length){const g=mergeGeometries(arr);arr.forEach(v=>v.dispose());if(g){const map=tex('diffuser'),on=arr===lit;const mat=litMaterial({map,color:on?'#c4c1ac':color,emissive:on?color:'#000000',emissiveMap:map,normalMap:tex('diffuser-normal',true),normalScale:new THREE.Vector2(.04,.04),roughnessMap:getMaterialMode()==='realistic'?tex('diffuser-rough',true):undefined,emissiveIntensity:on?(getMaterialMode()==='realistic'?3.8:1.3):0,roughness:.92,envBase:.008});root.add(new THREE.Mesh(g,mat))}}
 for(const p of a.puddles)for(const [x,z,w,d]of [[p.x,p.y,.008,p.h],[p.x+p.w-.008,p.y,.008,p.h],[p.x,p.y,p.w,.008],[p.x,p.y+p.h-.008,p.w,.008]])box(x,-p.depth,z,w,p.depth,d,'carpet')
 for(const [name,arr]of groups){const merged=mergeGeometries(arr);arr.forEach(g=>g.dispose());if(merged){const mesh=new THREE.Mesh(merged,material(name));mesh.castShadow=!name.includes('carpet')&&name!=='wood'&&!name.endsWith('trim');mesh.receiveShadow=true;root.add(mesh)}yield}
 for(const p of a.puddles){const g=new THREE.PlaneGeometry(p.w,p.h);g.rotateX(-Math.PI/2);g.translate(p.x+p.w/2-ox,-.018,p.y+p.h/2-oy);root.add(new THREE.Mesh(g,litMaterial({color:'#38372b',transparent:true,opacity:.35,roughness:.2,envBase:.15,depthWrite:false})))}
 root.userData.l0Architecture=true
 }finally{for(const arr of groups.values())for(const g of arr)g.dispose();root.traverse(o=>{const m=(o as THREE.Mesh).material;if(m)for(const mat of(Array.isArray(m)?m:[m]))mat.userData.l0Owned=true})}
}
