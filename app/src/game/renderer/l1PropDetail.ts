import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
/**
 * v3 L1 props, remodelled: bevelled/lathed/bent geometry with proper UVs and printed or worn canvas textures
 * (folding table, stacking chair, corrugated panel, louvre cover, extinguisher, paint can, wet-floor A-frame).
 * Textures are procedural (no external assets) and cached; each prop stays a handful of merged meshes.
 */
type Part={geo:THREE.BufferGeometry;mat:THREE.Material}
const texCache=new Map<string,THREE.CanvasTexture>()
function rng(seed:number){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296}}
function canvasTex(key:string,w:number,h:number,draw:(c:CanvasRenderingContext2D,r:()=>number)=>void,repeat=false){
 const hit=texCache.get(key);if(hit)return hit
 const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d')!;draw(c,rng(key.length*7919+w*31+h))
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping
 texCache.set(key,t);return t
}
function noise(c:CanvasRenderingContext2D,w:number,h:number,r:()=>number,n:number,col:string,a:number,s:number){c.save();c.fillStyle=col;for(let i=0;i<n;i++){c.globalAlpha=a*r();const k=s*(.4+r());c.fillRect(r()*w,r()*h,k,k)}c.restore()}
function scratches(c:CanvasRenderingContext2D,w:number,h:number,r:()=>number,n:number,col:string,a:number){c.save();c.strokeStyle=col;for(let i=0;i<n;i++){c.globalAlpha=a*(.3+r()*.7);c.lineWidth=.5+r();const x=r()*w,y=r()*h,l=8+r()*40,t=r()*Math.PI;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(t)*l,y+Math.sin(t)*l);c.stroke()}c.restore()}
function grime(c:CanvasRenderingContext2D,w:number,h:number,_r:()=>number,a:number){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.7,'rgba(40,32,22,0)');g.addColorStop(1,`rgba(40,32,22,${a})`);c.fillStyle=g;c.fillRect(0,0,w,h)}
const T={
 plastic:()=>canvasTex('l1p-plastic',256,256,(c,r)=>{c.fillStyle='#dcdcd4';c.fillRect(0,0,256,256);noise(c,256,256,r,2600,'#9a9a90',.35,1.6);noise(c,256,256,r,300,'#ffffff',.4,2);scratches(c,256,256,r,60,'#8d8c82',.35)},true),
 blackPP:()=>canvasTex('l1p-pp',256,256,(c,r)=>{c.fillStyle='#2a2e2f';c.fillRect(0,0,256,256);noise(c,256,256,r,3000,'#444a4b',.5,1.2);scratches(c,256,256,r,90,'#5e6464',.45)},true),
 paintSteel:(base:string,key:string)=>canvasTex('l1p-steel-'+key,256,256,(c,r)=>{c.fillStyle=base;c.fillRect(0,0,256,256);noise(c,256,256,r,1600,'#000000',.08,2);scratches(c,256,256,r,70,'#d6d4c8',.35);for(let i=0;i<14;i++){c.fillStyle=`rgba(${110+r()*40|0},${60+r()*20|0},30,${.25+r()*.4})`;c.beginPath();c.ellipse(r()*256,r()*256,2+r()*6,1+r()*4,r()*3,0,Math.PI*2);c.fill()}grime(c,256,256,r,.35)},true),
 galv:()=>canvasTex('l1p-galv',256,256,(c,r)=>{c.fillStyle='#a3a7a5';c.fillRect(0,0,256,256);for(let i=0;i<70;i++){c.fillStyle=`rgba(${200+r()*40|0},${205+r()*40|0},${205+r()*40|0},${.03+r()*.05})`;c.beginPath();c.arc(r()*256,r()*256,3+r()*9,0,Math.PI*2);c.fill()}noise(c,256,256,r,900,'#5d625f',.2,2);grime(c,256,256,r,.45)},true),
 extinguisher:()=>canvasTex('l1p-ext',512,256,(c,r)=>{c.fillStyle='#b3342b';c.fillRect(0,0,512,256);const g=c.createLinearGradient(0,0,512,0);for(const [o,a] of [[0,.25],[.22,0],[.3,.12],[.5,0],[.75,.18],[1,.25]] as const)g.addColorStop(o,`rgba(0,0,0,${a})`);c.fillStyle=g;c.fillRect(0,0,512,256)
  c.fillStyle='#f2efe4';c.fillRect(170,70,170,130);c.fillStyle='#b3342b';c.font="900 30px 'Noto Sans CJK SC','Microsoft YaHei',sans-serif";c.textAlign='center';c.fillText('灭火器',255,108);c.fillStyle='#222';c.font="700 14px Arial,sans-serif";c.fillText('ABC DRY POWDER  4 kg',255,132)
  c.font="12px Arial,sans-serif";for(let i=0;i<4;i++){c.fillStyle='#555';c.fillRect(186,145+i*12,138*(.6+r()*.4),5)}c.fillStyle='#e0b020';c.fillRect(170,186,170,14);scratches(c,512,256,r,80,'#efe2d0',.3);grime(c,512,256,r,.4)}),
 paintLabel:()=>canvasTex('l1p-paint',512,128,(c,r)=>{c.fillStyle='#d8d4c8';c.fillRect(0,0,512,128);c.fillStyle='#24406a';c.fillRect(0,0,512,40);c.fillStyle='#f2efe6';c.font="800 26px Arial,'Noto Sans CJK SC',sans-serif";c.textAlign='center';c.fillText('INTERIOR EMULSION',256,30)
  c.fillStyle='#24406a';c.font="700 34px 'Noto Sans CJK SC','Microsoft YaHei',sans-serif";c.fillText('内墙乳胶漆 · 白',256,84);c.font="14px Arial";c.fillText('5 L   MATT   NO. 0912',256,112);for(let i=0;i<9;i++){c.fillStyle=`rgba(230,230,224,${.5+r()*.5})`;const x=r()*512;c.fillRect(x,0,3+r()*5,40+r()*80)}grime(c,512,128,r,.3)}),
 caution:()=>canvasTex('l1p-caution',256,512,(c,r)=>{c.fillStyle='#e3b81f';c.fillRect(0,0,256,512);c.fillStyle='#161616';c.font="900 46px 'Noto Sans CJK SC','Microsoft YaHei',sans-serif";c.textAlign='center';c.fillText('小心',128,80);c.fillText('地滑',128,132)
  c.beginPath();c.moveTo(128,170);c.lineTo(230,345);c.lineTo(26,345);c.closePath();c.fill();c.fillStyle='#e3b81f';c.beginPath();c.moveTo(128,200);c.lineTo(205,330);c.lineTo(51,330);c.closePath();c.fill()
  c.fillStyle='#161616';c.beginPath();c.arc(118,236,11,0,Math.PI*2);c.fill();c.lineWidth=9;c.lineCap='round';c.strokeStyle='#161616';c.beginPath();c.moveTo(116,250);c.lineTo(130,285);c.lineTo(156,300);c.moveTo(130,285);c.lineTo(104,306);c.moveTo(120,262);c.lineTo(150,252);c.moveTo(120,262);c.lineTo(94,275);c.stroke();c.fillRect(70,314,116,6)
  c.font="900 34px Arial,sans-serif";c.fillText('CAUTION',128,400);c.font="700 26px Arial,sans-serif";c.fillText('WET FLOOR',128,436);scratches(c,256,512,r,60,'#fff3c0',.3);grime(c,256,512,r,.35)}),
}
const mat=(o:THREE.MeshStandardMaterialParameters&{envBase?:number})=>{const m=litMaterial({roughness:.8,envBase:.12,...o} as any);m.userData.l1Owned=true;return m}
function add(g:THREE.Group,parts:Part[]){const by=new Map<THREE.Material,THREE.BufferGeometry[]>();for(const p of parts){const a=by.get(p.mat)??[];a.push(p.geo);by.set(p.mat,a)}
 for(const [m,gs] of by){const nonIndexed=gs.some(x=>!x.index);const list=nonIndexed?gs.map(x=>x.index?x.toNonIndexed():x):gs;const merged=mergeGeometries(list,false);if(merged)g.add(new THREE.Mesh(merged,m));for(const geo of new Set([...gs,...list]))geo.dispose()}}
function P(geo:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0):Part{if(rx)geo.rotateX(rx);if(ry)geo.rotateY(ry);if(rz)geo.rotateZ(rz);geo.translate(x,y,z);for(const k of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(k))geo.deleteAttribute(k);return{geo,mat:m}}
/** Rounded-rectangle slab (bevelled), UV in metres so tiling textures keep scale. */
function slab(w:number,d:number,t:number,r:number,bevel=.006){
 const s=new THREE.Shape(),x=-w/2,y=-d/2
 s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y)
 const g=new THREE.ExtrudeGeometry(s,{depth:t-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:5});g.translate(0,0,-(t-bevel*2)/2);g.rotateX(-Math.PI/2)
 const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*1,uv.getY(i)*1);return g
}
const tube=(pts:[number,number,number][],r:number,seg=12)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),seg,r,6,false)
const rod=(a:[number,number,number],b:[number,number,number],r:number)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),len=va.distanceTo(vb),g=new THREE.CylinderGeometry(r,r,len,8,1);g.translate(0,len/2,0);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vb.clone().sub(va).normalize()));g.translate(...a);return g}

export function foldingtable(){
 const g=new THREE.Group(),top=mat({map:T.plastic(),color:'#e6e6de',roughness:.62}),iron=mat({map:T.paintSteel('#4a4f4d','dk'),color:'#ffffff',metalness:.45,roughness:.5}),rubber=mat({color:'#1b1c1b',roughness:.95})
 const a:Part[]=[P(slab(1.52,.72,.045,.06),top,0,.735,0)]
 a.push(P(rod([-.7,.705,-.31],[.7,.705,-.31],.012),iron),P(rod([-.7,.705,.31],[.7,.705,.31],.012),iron),P(rod([-.7,.705,-.31],[-.7,.705,.31],.012),iron),P(rod([.7,.705,-.31],[.7,.705,.31],.012),iron))
 for(const sx of [-1,1]){const x=sx*.58
  for(const z of [-.27,.27]){a.push(P(rod([x,.03,z],[x+sx*.02,.705,z*.95],.0145),iron));a.push(P(new THREE.CylinderGeometry(.02,.022,.03,8),rubber,x,.015,z))}
  a.push(P(rod([x,.12,-.27],[x,.12,.27],.011),iron))
  a.push(P(rod([x,.45,0],[x*.55,.70,0],.01),iron))
 }
 add(g,a);return g
}
export function seat(){
 const g=new THREE.Group(),shell=mat({map:T.blackPP(),color:'#ffffff',roughness:.55}),chrome=mat({color:'#8c918f',metalness:.85,roughness:.32})
 // bent polypropylene shell: seat dish + curved back, single surface with thickness
 const seatG=new THREE.BoxGeometry(.44,.025,.42,10,1,10),pos=seatG.getAttribute('position');for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,pos.getY(i)+x*x*.35+Math.max(0,z-.15)*.12-z*.03)}seatG.computeVertexNormals()
 const backG=new THREE.BoxGeometry(.42,.3,.02,10,6,1),bp=backG.getAttribute('position');for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i);bp.setZ(i,bp.getZ(i)-x*x*.45+y*y*.1)}backG.computeVertexNormals()
 const a:Part[]=[P(seatG,shell,0,.455,0),P(backG,shell,0,.71,.215,-.14)]
 for(const sx of [-1,1]){a.push(P(tube([[sx*.19,0,-.2],[sx*.2,.43,-.17],[sx*.2,.44,.16],[sx*.2,.45,.2],[sx*.2,.0,.22]],.011,20),chrome));a.push(P(rod([sx*.2,.45,.2],[sx*.19,.84,.25],.01),chrome))}
 a.push(P(rod([-.2,.43,-.17],[.2,.43,-.17],.009),chrome))
 add(g,a);return g
}
export function panel(){
 const g=new THREE.Group(),steel=mat({map:T.galv(),color:'#ffffff',metalness:.55,roughness:.55})
 const W=.9,H=1.68,geo=new THREE.PlaneGeometry(W,H,36,1),p=geo.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)/W*Math.PI*14)*.018);geo.computeVertexNormals()
 const back=geo.clone();back.rotateY(Math.PI);back.translate(0,0,-.002)
 const m=mergeGeometries([geo,back])!;geo.dispose();back.dispose()
 const a:Part[]=[P(m,steel,0,H/2+.01,0,.12)]
 add(g,a);g.children.forEach(c=>((c as THREE.Mesh).material as THREE.Material).side=THREE.FrontSide);return g
}
export function louver(){
 const g=new THREE.Group(),steel=mat({map:T.paintSteel('#8e918b','lv'),color:'#ffffff',metalness:.3,roughness:.62}),a:Part[]=[]
 for(const x of [-.43,.43])a.push(P(new THREE.BoxGeometry(.045,.86,.075),steel,x,.44,0,.1))
 for(const y of [.04,.84])a.push(P(new THREE.BoxGeometry(.9,.05,.075),steel,0,y,0,.1))
 for(let i=0;i<10;i++){const sl=new THREE.BoxGeometry(.82,.07,.012,1,3,1),sp=sl.getAttribute('position');for(let k=0;k<sp.count;k++)sp.setZ(k,sp.getZ(k)+Math.abs(sp.getY(k))*.25);sl.computeVertexNormals();a.push(P(sl,steel,0,.1+i*.072,0,-.55+.1))}
 add(g,a);return g
}
export function extinguisher(){
 const g=new THREE.Group(),body=mat({map:T.extinguisher(),color:'#ffffff',roughness:.42,metalness:.1}),black=mat({color:'#1d1f1e',roughness:.8}),brass=mat({color:'#b8a06a',metalness:.8,roughness:.35}),steel=mat({color:'#9aa09e',metalness:.8,roughness:.3})
 const prof:[number,number][]=[[0,0],[.098,0],[.104,.012],[.104,.44],[.098,.49],[.075,.53],[.04,.555],[.032,.57],[0,.57]]
 const lathe=new THREE.LatheGeometry(prof.map(([r,y])=>new THREE.Vector2(r,y)),28)
 const a:Part[]=[P(lathe,body,0,0,0)]
 a.push(P(new THREE.CylinderGeometry(.03,.03,.06,12),brass,0,.6,0))
 a.push(P(new THREE.BoxGeometry(.035,.02,.17),steel,0,.645,.04,.12),P(new THREE.BoxGeometry(.03,.018,.15),steel,0,.62,.05,-.05))
 a.push(P(new THREE.CylinderGeometry(.022,.022,.012,16),steel,.034,.6,0,0,0,Math.PI/2))
 a.push(P(tube([[0,.6,-.03],[0,.58,-.11],[.02,.45,-.12],[.06,.3,-.115],[.07,.2,-.11]],.011,24),black),P(new THREE.CylinderGeometry(.014,.01,.06,8),black,.07,.17,-.11))
 add(g,a);return g
}
export function paintcan(){
 const g=new THREE.Group(),label=mat({map:T.paintLabel(),color:'#ffffff',roughness:.6,metalness:.15}),tin=mat({map:T.galv(),color:'#c0c3bf',metalness:.75,roughness:.35}),white=mat({color:'#ecebe4',roughness:.55})
 const side=new THREE.CylinderGeometry(.113,.113,.25,28,1,true)
 const a:Part[]=[P(side,label,0,.145,0)]
 a.push(P(new THREE.TorusGeometry(.112,.008,6,28),tin,0,.27,0,Math.PI/2),P(new THREE.TorusGeometry(.112,.008,6,28),tin,0,.02,0,Math.PI/2),P(new THREE.CylinderGeometry(.11,.11,.006,28),tin,0,.272,0),P(new THREE.CylinderGeometry(.112,.112,.02,28),tin,0,.01,0))
 a.push(P(new THREE.TorusGeometry(.115,.003,4,24,Math.PI),tin,0,.27,0,0,.4))
 for(let i=0;i<4;i++){const ang=i*1.7+.3,len=.04+((i*37)%5)*.012;a.push(P(new THREE.CylinderGeometry(.006,.009,len,5),white,Math.cos(ang)*.114,.27-len/2,Math.sin(ang)*.114))}
 add(g,a);return g
}
export function caution(){
 const g=new THREE.Group(),face=mat({map:T.caution(),color:'#ffffff',roughness:.55}),yellow=mat({color:'#d8b11f',roughness:.6})
 const a:Part[]=[]
 for(const s of [-1,1]){
  const board=slab(.3,.62,.016,.03),uv=board.getAttribute('uv'),pos=board.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+.15)/.3,1-(pos.getZ(i)+.31)/.62)
  board.rotateX(Math.PI/2);if(s<0)board.rotateY(Math.PI);a.push(P(board,face,0,.31,s*.075,-s*.13))
 }
 a.push(P(new THREE.BoxGeometry(.12,.035,.03),yellow,0,.64,0))
 add(g,a);return g
}
/** v3.2 衔尾段: black steel grating / radiator panel leaned back against a column (ref 衔尾段.png). */
export function grate(){
 const g=new THREE.Group(),inner=new THREE.Group(),steel=mat({map:T.blackPP(),color:'#4a4d4c',metalness:.45,roughness:.7}),a:Part[]=[]
 const W=1.4,H=1.3
 for(const x of [-W/2,W/2])a.push(P(new THREE.BoxGeometry(.05,H,.04),steel,x,H/2,0))
 for(const y of [.03,H-.03])a.push(P(new THREE.BoxGeometry(W,.05,.04),steel,0,y,0))
 for(let i=1;i<10;i++)a.push(P(new THREE.BoxGeometry(.018,H-.08,.028),steel,-W/2+i*W/10,H/2,0))
 for(let i=1;i<8;i++)a.push(P(new THREE.BoxGeometry(W-.06,.016,.022),steel,0,i*H/8,.012))
 add(inner,a);inner.rotation.x=-.23;inner.position.z=.13;g.add(inner);return g
}
/** v3.2 衔尾段: leftover building materials — plywood sheets, a steel drum, a tin and an offcut. */
export function matpile(){
 const g=new THREE.Group(),r=rng(4711),a:Part[]=[]
 const ply=mat({map:canvasTex('l1p-ply',256,256,(c,q)=>{c.fillStyle='#c9ad7c';c.fillRect(0,0,256,256);c.globalAlpha=.25;for(let i=0;i<60;i++){c.strokeStyle=q()<.5?'#9b7d4e':'#e2c999';c.lineWidth=1+q()*3;const y=q()*256;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(80,y+q()*20-10,170,y+q()*20-10,256,y+q()*8-4);c.stroke()}c.globalAlpha=1;noise(c,256,256,q,600,'#5c4a30',.25,2)},true),color:'#ffffff',roughness:.85})
 const drum=mat({map:T.paintSteel('#2d5f8f','drum'),color:'#ffffff',metalness:.35,roughness:.55}),tin=mat({map:T.galv(),color:'#bfc2be',metalness:.7,roughness:.4}),dust=mat({color:'#8c8a83',roughness:.95})
 for(let i=0;i<4;i++)a.push(P(new THREE.BoxGeometry(1.2,.018,.6),ply,-.05+(r()-.5)*.08,.012+i*.02,-.25+(r()-.5)*.06,0,(r()-.5)*.12))
 a.push(P(new THREE.BoxGeometry(.9,.035,.12),ply,.05,.1,.12,0,.5))
 a.push(P(new THREE.CylinderGeometry(.28,.28,.86,24),drum,.38,.43,.3))
 for(const y of [.2,.66])a.push(P(new THREE.TorusGeometry(.285,.012,6,24),drum,.38,y,.3,Math.PI/2))
 a.push(P(new THREE.CylinderGeometry(.09,.09,.17,16),tin,-.35,.085,.32))
 a.push(P(new THREE.DodecahedronGeometry(.16,0),dust,-.55,.04,.05,0,0,0))
 add(g,a);return g
}
