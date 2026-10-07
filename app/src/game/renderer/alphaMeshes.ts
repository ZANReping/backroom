import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Structure } from '../core/types'
import { alphaParts, isAlphaKind, type AlphaPart, type AlphaPanel, type AlphaSurface } from '../content/alphaDecor'
import { getMaterialMode, litMaterial } from './shared'
import { l1Texture } from './l1Materials'
import { alphaNormalScale, applyAlphaSurface } from './alphaSurfaceShader'
import { archiveCode, archiveCodeIndex } from '../content/alphaArchiveDecor'

function archiveAtlas(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024
 const c=canvas.getContext('2d')!;c.fillStyle='#e5e1ce';c.fillRect(0,0,1024,1024)
 c.textAlign='center';c.textBaseline='middle';c.font='bold 19px monospace';c.fillStyle='#202820'
 for(const aisle of ['A','B','C','D'])for(let row=1;row<=5;row++)for(let col=1;col<=24;col++){
  const code=archiveCode(aisle,row,col),i=archiveCodeIndex(code);c.fillText(code,(i%16)*64+32,Math.floor(i/16)*32+16)
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture
}

function panelTexture(panel:AlphaPanel,text=''){
 if(panel==='archive_code')return archiveAtlas()
 const canvas=document.createElement('canvas');canvas.width=panel==='clock'?256:1024;canvas.height=panel==='clock'?256:panel==='label'?192:512
 const c=canvas.getContext('2d')!,w=canvas.width,h=canvas.height
 c.fillStyle=panel==='radio'?'#292b28':panel==='blackboard'?'#182725':panel==='map'?'#d8d0b2':'#e4e1cf';c.fillRect(0,0,w,h)
 if(panel==='clock'){
  c.fillStyle='#e9e6cc';c.beginPath();c.arc(128,128,124,0,Math.PI*2);c.fill();c.strokeStyle='#393e38';c.lineWidth=7;c.stroke()
  for(let i=0;i<60;i++){const t=i*Math.PI/30;c.lineWidth=i%5?1:3;c.beginPath();c.moveTo(128+Math.sin(t)*(i%5?112:104),128-Math.cos(t)*(i%5?112:104));c.lineTo(128+Math.sin(t)*117,128-Math.cos(t)*117);c.stroke()}
  c.font='19px Georgia';c.textAlign='center';c.textBaseline='middle';for(let i=1;i<=12;i++){const t=i*Math.PI/6;c.fillStyle='#43453d';c.fillText(String(i),128+Math.sin(t)*89,128-Math.cos(t)*89)}
  c.lineWidth=4;c.beginPath();c.moveTo(87,97);c.lineTo(128,128);c.lineTo(179,70);c.stroke();c.font='12px sans-serif';c.fillText('UTC',128,168)
 }else if(panel==='residential_art'){
  const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#9aafae');sky.addColorStop(.6,'#d6d6b7');sky.addColorStop(1,'#8c9a6b');c.fillStyle=sky;c.fillRect(0,0,w,h)
  c.fillStyle='#e8dfb7';c.beginPath();c.arc(780,98,37,0,Math.PI*2);c.fill()
  for(let i=0;i<4;i++){c.fillStyle=['#829890','#6f8777','#627658','#435e43'][i];c.beginPath();c.moveTo(0,h);for(let x=0;x<=w;x+=16)c.lineTo(x,210+i*68+Math.sin(x*.007+i)*53+Math.sin(x*.016)*12);c.lineTo(w,h);c.fill()}
 }else if(panel==='memorial'){
  c.fillStyle='#d7cdb1';c.fillRect(0,0,w,h);c.fillStyle='#43564f';c.textAlign='center';c.font='bold 60px Georgia';c.fillText('ASHER RIVER',w/2,119);c.font='39px sans-serif';c.fillText('阿谢儿 · 利沃',w/2,200);c.font='26px sans-serif';c.fillText('M.E.G. ARCHIVIST  /  档案员',w/2,276);c.fillText('RIVER DISTRICT  /  利沃区',w/2,353);c.strokeStyle='#8c9279';c.lineWidth=3;c.strokeRect(22,22,w-44,h-44)
 }else if(panel==='library_screen'){
  c.fillStyle='#dce4d3';c.fillRect(0,0,w,h);c.fillStyle='#476b63';c.fillRect(0,0,w,75);c.fillStyle='#f1ebd7';c.font='bold 35px sans-serif';c.fillText('EPIPHANY / MULTIMEDIA LIBRARY',25,51)
  c.fillStyle='#49625a';c.font='28px sans-serif';['CATALOGUE  /  借阅目录','Books · Audio · Films · Community','FIELD GUIDES     001 — 094','ORAL HISTORY    095 — 126','MUSIC ARCHIVE  127 — 215'].forEach((v,i)=>c.fillText(v,35,132+i*71));c.fillStyle='#7a9b7e';c.fillRect(787,368,190,48)
 }else if(panel==='radio'){
  c.fillStyle='#ddc180';c.fillRect(45,32,370,150);c.fillRect(480,32,460,150);c.strokeStyle='#4b4436';c.lineWidth=3
  for(let x=70;x<930;x+=25){c.beginPath();c.moveTo(x,75);c.lineTo(x,110+(x%50?10:35));c.stroke()}
  c.fillStyle='#242c28';c.font='26px monospace';c.fillText('RECEIVER   MHz',90,165)
  for(let row=0;row<2;row++)for(let i=0;i<8;i++){const x=80+i*117,y=270+row*145;c.fillStyle='#b8a271';c.beginPath();c.arc(x,y,17,0,Math.PI*2);c.fill();c.fillStyle='#c5c6b2';c.font='17px monospace';c.fillText(['GAIN','AF','RF','BAND'][i%4],x-22,y+48)}
 }else if(panel==='blackboard'){
  c.strokeStyle='#a6bab0';c.lineWidth=2;c.font='22px monospace';c.fillStyle='#c3c9af';c.fillText('M.E.G.  /  FIELD BRIEFING',40,65);c.font='16px monospace';c.fillText('ROUTE  -  CONTACT  -  RETURN',44,106)
  for(let j=0;j<5;j++){c.beginPath();c.moveTo(40,160+j*47);c.lineTo(300+(j%3)*50,160+j*47);c.stroke()}
  c.beginPath();c.moveTo(730,390);c.lineTo(700,320);c.lineTo(775,240);c.lineTo(880,275);c.lineTo(954,130);c.stroke()
 }else if(panel==='shipping_label'){
  c.fillStyle='#e6e1cf';c.fillRect(0,0,w,h);c.fillStyle='#292f28';c.font='bold 60px monospace';c.fillText(text||'ALPHA / TRANSIT',35,80)
  c.font='28px monospace';c.fillText('M.E.G.  |  ROUTE 01  |  CHECKED',35,142);c.fillText('TO: ALPHA BASE / INTAKE',35,208)
  c.strokeStyle='#777968';c.lineWidth=3;for(const y of [240,286]){c.beginPath();c.moveTo(35,y);c.lineTo(980,y);c.stroke()}
  for(let i=0,x=42;i<90;i++){const bw=2+(i*17%7);c.fillRect(x,326,bw,100);x+=bw+3}
  c.font='28px monospace';c.fillText('01  0024  00871  35',38,470)
 }else if(panel==='admin_projection'){
  c.fillStyle='#dbe2d4';c.fillRect(0,0,w,h);c.fillStyle='#566b63';c.font='bold 37px sans-serif';c.fillText('M.E.G. / ALPHA FIELD BRIEFING',42,62)
  c.fillStyle='#a8beb5';c.fillRect(40,96,944,330)
  for(let i=0;i<3;i++){c.fillStyle=['#9aada0','#7f948a','#526f65'][i];c.beginPath();c.moveTo(40,426);for(let x=40;x<990;x+=24)c.lineTo(x,195+i*65+Math.sin(x*.011+i)*43+Math.sin(x*.028)*22);c.lineTo(984,426);c.closePath();c.fill()}
  c.strokeStyle='#d7d8a6';c.lineWidth=5;c.beginPath();c.moveTo(142,398);c.lineTo(320,345);c.lineTo(555,354);c.lineTo(723,259);c.stroke();c.fillStyle='#475d54';c.font='24px monospace';c.fillText('CONTACT  /  SUPPLY  /  RETURN',45,476)
 }else if(panel==='admin_screen'){
  c.fillStyle='#e5e6d4';c.fillRect(0,0,w,h);c.fillStyle='#415c52';c.fillRect(0,0,w,62);c.fillStyle='#f4efda';c.font='bold 30px monospace';c.fillText('ALPHA / OPERATIONS NETWORK',25,42)
  c.fillStyle='#bcccb7';c.fillRect(22,84,218,402);c.fillStyle='#3e5549';c.font='25px monospace';['Personnel','Supplies','Trade routes','Duty roster','Reports'].forEach((v,i)=>c.fillText(v,35,134+i*70))
  for(let i=0;i<7;i++){c.fillStyle=i%2?'#cdd7c5':'#dfe3d2';c.fillRect(265,88+i*55,735,49);c.fillStyle='#435b4b';c.fillText(['NORTH / ARRIVALS','ROUTE 01 / CHECKED','SUPPLY / RECEIVED'][i%3],280,121+i*55);c.fillStyle='#568266';c.fillRect(931,101+i*55,33,18)}
 }else if(panel==='archive_screen'){
  if(text==='notice'){
   c.fillStyle='#e8e4d7';c.fillRect(0,0,w,h);c.fillStyle='#374b4d';c.font='bold 48px monospace';c.fillText('ARCHIVES / ALPHA',40,78)
   c.font='30px monospace';['RETURN LOGS BEFORE 18:00','KEEP ORIGINAL ORDER','BACK UP TO OMEGA','A124 = A / 1 / 24'].forEach((v,i)=>c.fillText(v,40,160+i*80))
  }else{
   c.fillStyle='#497891';c.fillRect(0,0,w,h);c.fillStyle='#dae2df';c.fillRect(22,32,980,440);c.fillStyle='#254976';c.fillRect(22,32,980,37)
   c.fillStyle='#f0f3e9';c.font='21px monospace';c.fillText(text==='catalogue'?'M.E.G. ARCHIVE CATALOGUE':'BACK OS / M.E.G. DEVELOPMENT',40,58)
   c.fillStyle='#f3f2e4';c.fillRect(36,88,202,348);c.fillStyle='#394e54';c.font='18px monospace';['Explorer logs','Entity records','Research papers','Incident reports','Omega / Online'].forEach((v,i)=>c.fillText(v,45,130+i*53))
   c.fillStyle='#1e3038';c.fillRect(258,88,722,348);c.font='17px monospace'
   for(let i=0;i<15;i++){c.fillStyle=['#9ebbd1','#bccbac','#cdb38c'][i%3];c.fillText(text==='catalogue'?`${String(i+121).padStart(4,'0')}    FIELD REPORT / VERIFIED`:[` ${i+1}  function syncArchive(record) {`,'       validateIndex(record.location);','       await omega.store(record);','       return { status: "indexed" };','     }'][i%5],274,115+i*21)}
  }
 }else if(panel==='research_screen'){
  c.fillStyle='#b5c3b5';c.fillRect(0,0,w,h);c.fillStyle='#293f3b';c.fillRect(22,44,w-44,h-75)
  c.fillStyle='#e1e5cf';c.font='24px monospace';c.fillText('BACK OS / ALPHA RESEARCH',32,31)
  for(let i=0;i<12;i++){const y=76+i*31;c.strokeStyle=['#a8c298','#d8c577','#6fafa1'][i%3];c.lineWidth=2;c.beginPath();for(let x=40;x<w-40;x+=6){const yy=y+Math.sin(x*.031+i)*6+Math.sin(x*.083)*2;if(x===40)c.moveTo(x,yy);else c.lineTo(x,yy)}c.stroke()}
 }else if(panel==='lab_paper'){
  c.fillStyle='#e7e5d2';c.fillRect(0,0,w,h);c.fillStyle='#4f6657';c.font='bold 30px monospace';c.fillText('BIOLOGY / SAMPLE RECORD',40,65)
  c.strokeStyle='#929c89';c.lineWidth=2;for(let y=110;y<h-30;y+=42){c.beginPath();c.moveTo(40,y);c.lineTo(w-40,y);c.stroke()}for(const x of [40,320,660,w-40]){c.beginPath();c.moveTo(x,110);c.lineTo(x,h-30);c.stroke()}
  c.font='24px monospace';c.fillText('A-239    /    145',65,155);c.fillText('ALPHA  -  RESEARCH WING',65,h-65)
 }else if(panel==='notice'){
  c.fillStyle='#927551';c.fillRect(0,0,w,h)
  c.fillStyle='#6f563e';c.fillRect(28,28,w-56,h-56)
  c.fillStyle='#f0e8d5';c.textAlign='left';c.textBaseline='alphabetic';c.font='bold 48px sans-serif';c.fillText('ALPHA / DUTY BOARD',58,100)
  const cards=[['SHIFT ROSTER','#b84d4d'],['LOST & FOUND','#426a9b'],['RETURN CHECK','#4e875f']]
  cards.forEach(([title,pin],i)=>{const x=72+i*300,y=156+(i%2)*12;c.fillStyle='#eee5d3';c.fillRect(x,y,244,212);c.fillStyle=pin;c.beginPath();c.arc(x+122,y+10,10,0,Math.PI*2);c.fill();c.fillStyle='#3e443d';c.font='bold 22px sans-serif';c.fillText(title,x+18,y+55);c.strokeStyle='#aaa28f';c.lineWidth=3;for(let j=0;j<4;j++){c.beginPath();c.moveTo(x+18,y+82+j*25);c.lineTo(x+218-(j%2)*36,y+82+j*25);c.stroke()}})
  c.fillStyle='#8fb091';c.fillRect(w-240,h-128,150,78);c.strokeStyle='#d3e0c4';c.lineWidth=3;c.strokeRect(w-240,h-128,150,78);c.strokeStyle='#4e6f59';c.beginPath();c.moveTo(w-225,h-75);c.lineTo(w-180,h-105);c.lineTo(w-145,h-83);c.lineTo(w-110,h-112);c.stroke();c.fillStyle='#f2ead6';c.font='15px monospace';c.fillText('SECTOR MAP',w-230,h-38)
 }else if(panel==='community'){
  const lines=text.split('|');c.fillStyle='#a58f6b';c.fillRect(0,0,w,h)
  c.fillStyle='#efe8cf';c.fillRect(20,18,w-40,66);c.fillStyle='#43574c';c.font='bold 34px sans-serif';c.fillText(lines[0],40,63,w-80)
  for(let i=0;i<Math.min(4,lines.length-1);i++){
   const x=28+(i%2)*498,y=108+Math.floor(i/2)*192;c.save();c.translate(x+230,y+80);c.rotate((i%2?1:-1)*.022)
   c.fillStyle='rgba(40,35,25,.18)';c.fillRect(-226,-75,460,160);c.fillStyle=['#e5dcc0','#c9d5c3','#d7c4aa','#d0d8d2'][i];c.fillRect(-230,-79,458,158)
   c.fillStyle='#976349';c.beginPath();c.arc(0,-68,7,0,Math.PI*2);c.fill();c.fillStyle='#414a40';c.font='30px sans-serif'
   const note=lines[i+1];for(let row=0;row<3;row++)c.fillText(note.slice(row*13,(row+1)*13),-205,-22+row*37,408)
   c.restore()
  }
 }else if(panel==='map'){
  c.strokeStyle='#a9a791';c.lineWidth=1;for(let x=0;x<w;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}for(let y=0;y<h;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
  c.strokeStyle='#8b8672';c.lineWidth=4;for(let i=0;i<11;i++){c.strokeRect(32+i*83,50+(i%4)*70,55,130);c.beginPath();c.moveTo(i*93,35);c.lineTo(i*93+36,465);c.stroke()}
  c.strokeStyle='#ad6957';c.lineWidth=4;c.beginPath();c.moveTo(64,444);c.lineTo(340,360);c.lineTo(473,170);c.lineTo(870,120);c.stroke();c.fillStyle='#474c3d';c.font='25px monospace';c.fillText('ALPHA / OPERATIONS',35,34)
 }else{
  c.fillStyle='#343c35';c.textAlign='center';c.textBaseline='middle';c.font='bold 49px sans-serif';c.fillText(text||'M.E.G. / 014',w/2,h/2,w-36)
  c.strokeStyle='#a49e88';c.lineWidth=4;c.strokeRect(8,8,w-16,h-16)
 }
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t
}
const prefix:Partial<Record<AlphaSurface,string>>={wood:'alpha/wood',laminate:'alpha/wood',cabinet_metal:'alpha/steel',plaster:'alpha/plaster',terrazzo:'alpha/terrazzo',terrazzo_floor:'alpha/terrazzo',office_fabric:'settlements/fabric',fabric:'settlements/fabric',carpet:'settlements/fabric',tile:'alpha/terrazzo',ceiling:'alpha/plaster',soffit:'alpha/plaster',steel:'alpha/steel',vinyl:'alpha/plaster',linoleum:'alpha/terrazzo'}
Object.assign(prefix,{cardboard:'alpha/cardboard',packing_tape:'alpha/plaster',perforated_metal:'alpha/steel',admin_stone:'alpha/terrazzo',painted_block:'alpha/plaster'})
Object.assign(prefix,{aquila_concrete:'alpha/concrete',cave_rock:'alpha/cave_rock',substrate:'alpha/cave_rock',residential_panel:'alpha/plaster'})
function material(p:AlphaPart){
 if(p.surface==='glass'){
  const glass=litMaterial({color:p.color||'#b9d3cf',roughness:.16,metalness:0,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide})
  glass.name='alpha-glass';glass.userData.alphaGlass=true;glass.userData.l1Owned=true
  return glass
 }
 const name=prefix[p.surface],panel=p.panel?panelTexture(p.panel,p.text):undefined
 const mat=litMaterial({color:p.panel?'#ffffff':p.color,roughness:p.surface==='packing_tape'?.18:p.surface==='perforated_metal'?.42:p.surface==='admin_stone'?.48:p.surface==='cabinet_metal'?.5:p.surface==='laminate'?.48:p.surface==='steel'?.34:p.surface==='vinyl'||p.surface==='linoleum'?.62:p.surface==='wood'?.34:p.surface==='plastic'?.42:p.surface==='metal'?.43:.86,metalness:p.surface==='perforated_metal'?.35:p.surface==='cabinet_metal'?.25:p.surface==='steel'?.78:p.surface==='metal'?.38:0,
  ...(name&&!panel?{map:l1Texture(name+'_color.jpg'),normalMap:l1Texture(name+'_normalgl.jpg',true),normalScale:new THREE.Vector2(alphaNormalScale(p.surface),alphaNormalScale(p.surface)),...(getMaterialMode()==='realistic'?{roughnessMap:l1Texture(name+'_roughness.jpg',true)}:{})}:{}),
  ...(panel?{map:panel}:{}),...(p.surface==='light'?{emissive:p.color,emissiveIntensity:1.2}:p.panel==='admin_projection'?{emissive:'#e1e7d9',emissiveIntensity:.72}:p.panel==='admin_screen'?{emissive:'#c5d4c2',emissiveIntensity:.22}:{})})
 mat.name='alpha-'+p.surface;mat.userData.l1Owned=true;if(panel)mat.userData.settlementLabelTexture=true
 if(name&&!panel)applyAlphaSurface(mat,p.surface)
 if(p.panel==='archive_code'){
  mat.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float alphaArchiveCode;')
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    vec2 archiveCell=vec2(mod(alphaArchiveCode,16.0),31.0-floor(alphaArchiveCode/16.0));
    vMapUv=(vec2(0.02,0.04)+uv*vec2(0.96,0.92)+archiveCell)/vec2(16.0,32.0);`)
  };mat.customProgramCacheKey=()=> 'alpha-archive-codes-v1';mat.userData.alphaArchiveAtlas=true
 }
 return mat
}
function* buildJob(structures:Structure[],parent:THREE.Group):Generator<void,void,unknown>{
 const box=new THREE.BoxGeometry(1,1,1),round=new RoundedBoxGeometry(1,1,1,2,.1),rod=new THREE.CylinderGeometry(.5,.5,1,12),disc=rod.clone(),shade=new THREE.CylinderGeometry(.32,.5,1,20)
 disc.rotateX(Math.PI/2)
 const geometry={box,round,rod,disc,shade,globe:new THREE.SphereGeometry(.5,16,10)},materials=new Map<string,THREE.Material>(),buckets=new Map<string,{p:AlphaPart;matKey:string;matrices:THREE.Matrix4[];codes:number[];fixture:boolean}>()
 const up=new THREE.Vector3(0,1,0),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3()
 for(const s of structures){
  q.setFromAxisAngle(up,Number(s.data?.deg??0)*Math.PI/180)
  for(const p of alphaParts(s)){
   pos.set(p.x+p.w/2-s.w/2,p.z+p.h/2,p.y+p.d/2-s.h/2).applyQuaternion(q);pos.x+=s.x+s.w/2;pos.z+=s.y+s.h/2
   scale.set(p.w,p.h,p.d)
   const fixture=s.kind==='alpha_light'||s.kind==='alpha_ceiling'||p.surface==='light'
   const matKey=[p.surface,p.color,p.panel??'',p.panel==='archive_code'?'':p.text??''].join('|'),glassKey=p.surface==='glass'?`:${s.x}:${s.y}:${s.w}:${s.h}:${s.data?.deg??0}`:'',key=Math.floor(s.x/12)+':'+Math.floor(s.y/12)+':'+(p.shape??'box')+':'+matKey+glassKey+(fixture?':fixture':'')
   let entry=buckets.get(key);if(!entry){entry={p,matKey,matrices:[],codes:[],fixture};buckets.set(key,entry)}entry.matrices.push(new THREE.Matrix4().compose(pos,q,scale));if(p.panel==='archive_code')entry.codes.push(archiveCodeIndex(p.text!))
  }
  yield
 }
 for(const [key,{p,matKey,matrices,codes,fixture}] of buckets){
  let mat=materials.get(matKey);if(!mat){mat=material(p);materials.set(matKey,mat)}
  const geo=codes.length?geometry.box.clone():geometry[p.shape??'box']
  if(codes.length)geo.setAttribute('alphaArchiveCode',new THREE.InstancedBufferAttribute(new Float32Array(codes),1))
  const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);if(codes.length)mesh.userData.alphaArchiveLabels=true
  // Thin ceiling grids and diffusers lie almost against point sources. They receive shadows
  // from room objects, but do not project exaggerated self-shadows onto their own ceiling.
  if(fixture)mesh.userData.noCastShadow=true
  matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.name='alpha-'+key;parent.add(mesh);yield
  if(p.surface==='glass'){mesh.userData.alphaGlass=true;mesh.castShadow=false;mesh.receiveShadow=false}
 }
}
export function* buildAlphaBatchJob(structures:Structure[],parent:THREE.Group){yield* buildJob(structures.filter(s=>isAlphaKind(s.kind)),parent)}
export function buildAlphaDecor(s:Structure){const g=new THREE.Group();g.userData.alphaOrigin={x:s.x,y:s.y};for(const _ of buildJob([s],g))void _;return g}
