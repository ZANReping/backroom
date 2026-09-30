import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type P=[number,number]
let template:THREE.Group|undefined

/** Cut glass tesserae with thickness, individually outlined lead cames and stone
 * tracery. All figures are authored geometry: no image, canvas or texture sampling. */
export function buildL3Glass(width:number,height:number){
 if(!template)template=makeWindow()
 const group=template.clone(true)
 group.traverse(o=>{if((o as THREE.Mesh).isMesh){const m=o as THREE.Mesh;m.geometry=m.geometry.clone()}})
 group.scale.set(width/4.8,height/4.2,1)
 group.position.y=1.4
 group.name='l3-cut-glass-triptych'
 group.userData.geometryOnly=true
 return group
}

function makeWindow(){
 const glass:THREE.BufferGeometry[]=[],lead:THREE.BufferGeometry[]=[],stone:THREE.BufferGeometry[]=[]
 const line=(pts:P[],r=.009,z=.056,target=lead)=>{
  const curve=new THREE.CurvePath<THREE.Vector3>()
  for(let i=1;i<pts.length;i++)curve.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i-1],z),new THREE.Vector3(...pts[i],z)))
  target.push(new THREE.TubeGeometry(curve,Math.max(3,pts.length*(r>.03?2:1)),r,r>.03?6:4,false))
 }
 let piece=0
 const pane=(pts:P[],color:string,z=.014,outline=true)=>{
  // Layer overlapping hand-cut pieces by a sub-millimetre step. Coplanar feather
  // and robe facets otherwise flicker at oblique viewing angles.
  z+=piece*.000025
  const shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(...p)))
  const g=new THREE.ExtrudeGeometry(shape,{depth:.026,bevelEnabled:false,steps:1,curveSegments:6})
  g.translate(0,0,z);const c=new THREE.Color(color).multiplyScalar(.91+((piece++*37)%17)/100)
  const colors=new Float32Array(g.getAttribute('position').count*3)
  for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));glass.push(g)
  if(outline)line([...pts,pts[0]],.0045,z+.03)
 }
 const oval=(cx:number,cy:number,rx:number,ry:number,color:string,z=.02,n=18)=>pane(Array.from({length:n},(_,i)=>[cx+Math.cos(i/n*Math.PI*2)*rx,cy+Math.sin(i/n*Math.PI*2)*ry] as P),color,z)
 const lancet=(cx:number,w:number,base:number,shoulder:number,top:number):P[]=>{
  const p:P[]=[[cx-w/2,base],[cx+w/2,base],[cx+w/2,shoulder]]
  for(let i=1;i<=12;i++){const t=i/12;p.push([cx+w/2*(1-t),shoulder+(top-shoulder)*Math.sqrt(t)])}
  for(let i=11;i>=0;i--){const t=i/12;p.push([cx-w/2*(1-t),shoulder+(top-shoulder)*Math.sqrt(t)])}
  return p
 }
 const heart=(cx:number,y:number,s:number,color='#b52937')=>pane([[cx,y-s],[cx-s,y+.08*s],[cx-s,y+.6*s],[cx-.48*s,y+.87*s],[cx,y+.4*s],[cx+.48*s,y+.87*s],[cx+s,y+.6*s],[cx+s,y+.08*s]],color,.11)
 const face=(cx:number,y:number)=>{
  oval(cx,y,.137,.19,'#dfd5b9',.073)
  pane([[cx-.13,y+.045],[cx-.08,y-.09],[cx-.015,y-.17],[cx-.085,y-.13],[cx-.13,y-.045]],'#b5a889',.084)
  pane([[cx+.03,y+.11],[cx+.10,y+.05],[cx+.11,y-.06],[cx+.06,y-.12],[cx+.02,y-.065]],'#eee6ce',.087)
  pane([[cx-.14,y+.01],[cx-.13,y+.16],[cx-.05,y+.23],[cx+.08,y+.21],[cx+.15,y+.1],[cx+.09,y+.13],[cx,y+.16],[cx-.08,y+.10]],'#756047',.09)
  for(const side of [-1,1]){
   line([[cx+side*.024,y+.035],[cx+side*.063,y+.045],[cx+side*.093,y+.028]],.008,.132)
   oval(cx+side*.062,y+.012,.024,.009,'#ece4d1',.11,8)
   oval(cx+side*.06,y+.012,.008,.01,'#272b35',.139,8)
  }
  line([[cx-.012,y+.025],[cx-.025,y-.067],[cx+.018,y-.073]],.006,.139)
  line([[cx-.034,y-.112],[cx,y-.12],[cx+.035,y-.108]],.008,.138)
 }
 const feathers=(cx:number,cy:number,gold:boolean)=>{
  for(const side of [-1,1])for(let i=0;i<10;i++){
   const t=i/9,x=cx+side*(.22+t*.36),y=cy+.43-t*.052
   pane([[cx+side*.14,cy-.35],[x,cy+.10],[cx+side*.64,y],[x+side*.075,y+.08]],gold?(i%2?'#b68b29':'#ddba56'):(i%2?'#9c2637':'#cf3e32'),.052)
  }
 }
 // Three lancet panels with separate colored border tesserae and pale blue mosaic.
 for(const [index,cx]of [-1.6,0,1.6].entries()){
  const outline=lancet(cx,1.40,.12,2.95,3.68)
  pane(outline,'#6a9aaf',0)
  line([...outline,outline[0]],.058,.016,stone)
  for(let row=0;row<12;row++)for(let col=0;col<5;col++){
   const x=cx-.65+col*.26,y=.17+row*.225,sh=(row%2)*.024
   pane([[x,y],[x+.245,y+sh],[x+.247,y+.216],[x+.01,y+.208]],['#8cbcc3','#adc8c5','#537e98','#b9b8a4'][(row*7+col*3+index)%4],.006)
  }
  for(const side of [-1,1])for(let i=0;i<12;i++){
   const x=cx+side*.637,y=.25+i*.215
   pane([[x-.041,y],[x,y-.083],[x+.041,y],[x,y+.084]],i%3===0?'#99294d':i%3===1?'#d5c378':'#569b86',.052)
  }
  // Grass and botanical borders under the robes.
  for(let i=0;i<8;i++){const x=cx-.51+i*.145;pane([[x,.20],[x-.06,.28],[x+.018,.35],[x+.085,.29]],i%2?'#376b47':'#91a856',.052)}
  oval(cx,2.53,.285,.30,index===0?'#a16c4a':'#cbae53',.035)
  oval(cx,2.53,.24,.257,'#b4c6b6',.05)
  feathers(cx,2.10,index!==0)
  // Fitted shoulders and separately cut long garment folds.
  pane([[cx-.23,2.28],[cx+.23,2.28],[cx+.35,1.83],[cx+.24,1.36],[cx+.4,.43],[cx-.4,.43],[cx-.24,1.38],[cx-.35,1.83]],index===0?'#435c79':index===1?'#d5d3b8':'#52775d',.07)
  for(let j=0;j<7;j++){
   const x=cx-.28+j*.08,colors=index===0?['#344761','#718899','#b4bac2']:index===1?['#c3bda4','#ede1b8','#969779']:['#c18e30','#dbb958','#718647']
   pane([[cx+(x-cx)*.65,1.53],[cx+(x-cx)*.9,1.16],[x+.049,.47],[x-.024,.44],[cx+(x-cx)*.58,1.28]],colors[j%3],.095)
  }
  face(cx,2.55)
  if(index===0){
   // Knight: pointed helmet, articulated breastplate, sword and balance.
   pane([[cx-.15,2.61],[cx-.12,2.78],[cx,2.95],[cx+.13,2.78],[cx+.15,2.61],[cx,2.75]],'#a6b8c5',.145)
   pane([[cx-.22,2.26],[cx,2.31],[cx+.22,2.26],[cx+.18,1.96],[cx,1.84],[cx-.18,1.96]],'#91a6b9',.105)
   for(const s of [-1,1]){pane([[cx+s*.15,2.26],[cx+s*.26,2.24],[cx+s*.35,2.05],[cx+s*.14,1.88],[cx+s*.08,1.96],[cx+s*.25,2.08]],'#8299ac',.14);line([[cx+s*.25,2.20],[cx+s*.30,2.10],[cx+s*.23,2.03]],.007,.19);oval(cx+s*.1,1.93,.058,.04,'#ded4b8',.18)}
   pane([[cx-.40,.6],[cx-.44,2.02],[cx-.41,2.27],[cx-.38,2.02]],'#c9d7d4',.14)
   line([[cx-.54,1.96],[cx-.27,1.96]],.025,.17)
   line([[cx+.20,1.74],[cx+.20,2.15],[cx+.08,2.20],[cx+.39,2.20]],.013,.17)
   for(const s of [-1,1]){const x=cx+.23+s*.16;line([[cx+.23,2.18],[x,1.90]],.007,.17);pane([[x-.10,1.89],[x+.10,1.89],[x+.06,1.83],[x-.06,1.83]],'#c7a441',.15)}
  }else if(index===1){
   // Central angel extends both arms and holds a flared trumpet.
   for(const s of [-1,1]){pane([[cx+s*.18,2.24],[cx+s*.40,2.07],[cx+s*.46,1.76],[cx+s*.29,1.80]],'#e4dcbc',.13);oval(cx+s*.4,1.79,.056,.078,'#e0d4b4',.16)}
   pane([[cx-.05,2.36],[cx-.12,.92],[cx-.25,.74],[cx+.05,.73],[cx-.03,.94],[cx+.03,2.36]],'#d9b653',.17)
   line([[cx-.04,2.38],[cx+.055,2.40]],.021,.205)
   for(const x of [-.12,.12])line([[cx+x,2.21],[cx+x*.8,1.08]],.01,.135)
  }else{
   // Female deity: jeweled crown, red mantle, hands holding a ruby heart.
   pane([[cx-.17,2.74],[cx-.19,2.92],[cx-.09,2.85],[cx,3.04],[cx+.09,2.85],[cx+.19,2.92],[cx+.17,2.74]],'#c7a751',.15)
   for(const x of [-.12,0,.12])oval(cx+x,2.79,.027,.025,x?'#408dad':'#b5223b',.19,8)
   for(const s of [-1,1]){pane([[cx+s*.19,2.27],[cx+s*.30,2.22],[cx+s*.39,.62],[cx+s*.22,.52],[cx+s*.20,1.66]],'#9e3141',.14);pane([[cx+s*.16,2.19],[cx+s*.27,2.19],[cx+s*.33,1.91],[cx+s*.08,1.94],[cx+s*.08,2.04],[cx+s*.21,2.01]],'#caac61',.17);oval(cx+s*.095,1.99,.058,.041,'#e6d7b7',.20)}
   heart(cx,2.05,.14)
   for(const s of [-1,1])heart(cx+s*.47,.95,.062,'#b76578')
  }
  // Thin structural saddle bars, distinct from the smaller lead seams.
  for(const y of [1.10,1.83,2.75])line([[cx-.69,y],[cx+.69,y]],.014,.235)
  // Decorative upper fan of jewel-colored leaves above the halo.
  for(let j=0;j<7;j++){const a=j/6*Math.PI,x=cx+Math.cos(a)*.38,y=3.03+Math.sin(a)*.31;pane([[cx,3.0],[x-.06,y],[x,y+.09],[x+.06,y]],['#954e7c','#a8c9c3','#648b9f'][j%3],.07)}
 }
 // Quatrefoils and rosettes in real stone tracery above the three lancets.
 for(const [cx,cy,r]of [[-.80,3.67,.23],[.80,3.67,.23],[0,3.97,.16]]){
  for(let i=0;i<4;i++){const a=i*Math.PI/2;oval(cx+Math.cos(a)*r*.55,cy+Math.sin(a)*r*.55,r*.46,r*.46,['#598d96','#bc879f','#dfc978','#7fac8c'][i],.05,12)}
  const pts:P[]=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2,rr=r*(.75+.18*Math.cos(a*4));return[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]})
  line(pts,.035,.06,stone);oval(cx,cy,r*.19,r*.19,'#dbc36a',.095,10)
 }
 line([[-2.39,0],[2.39,0]],.085,0,stone)
 const outer=lancet(0,4.86,0,3.02,4.20)
 line([...outer,outer[0]],.072,-.015,stone)
 for(const side of [-1,1])line([[side*.80,3.35],[side*.80,3.67],[side*.40,3.92],[0,4.20]],.032,.005,stone)
 const group=new THREE.Group()
 const combine=(parts:THREE.BufferGeometry[],mat:THREE.Material,name:string)=>{
  // Extrude and tube geometry have different attribute layouts; each list is uniform.
  const merged=mergeGeometries(parts.map(g=>g.index?g.toNonIndexed():g),false)!
  parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(merged,mat);mesh.name=name;mesh.castShadow=false;group.add(mesh)
 }
 const glassMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.38,metalness:.06,emissive:'#ffffff',emissiveIntensity:.35,side:THREE.DoubleSide})
 glassMat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;')}
 glassMat.customProgramCacheKey=()=> 'l3-solid-glass-colored-backlight'
 combine(glass,glassMat,'individual-cut-glass')
 combine(lead,new THREE.MeshStandardMaterial({color:'#27282b',metalness:.72,roughness:.65}),'raised-lead-cames')
 combine(stone,new THREE.MeshStandardMaterial({color:'#847c69',roughness:.97}),'carved-stone-tracery')
 return group
}
