import type { Structure } from '../core/types'
import type { AlphaPart, AlphaSurface } from './alphaDecor'
import { alphaCupParts } from './alphaVessels'

/** Practical station hardware, kept inside existing furniture footprints. */
export function refineAlphaParts(s:Structure,a:AlphaPart[]):AlphaPart[]{
 const w=s.w,d=s.h,z=Number(s.data?.z??0),kind=s.kind,skin=String(s.data?.skin??'')
 const B=(x:number,y:number,h:number,ww:number,dd:number,hh:number,surface:AlphaSurface,color:string,shape?:AlphaPart['shape'],yaw=0)=>{
  a.push({x,y,z:z+h,w:ww,d:dd,h:hh,surface,color,shape,yaw})
 }
 const rail=(x1:number,y1:number,x2:number,y2:number,h:number,width=.014,color='#333b38')=>{
  const length=Math.hypot(x2-x1,y2-y1);if(length<.001)return
  B((x1+x2)/2-length/2,(y1+y2)/2-width/2,h,length,width,width,'plastic',color,undefined,-Math.atan2(y2-y1,x2-x1))
 }
 const paper=(x:number,y:number,h:number,ww=.22,dd=.29)=>{
  B(x,y,h,ww,dd,.012,'paint','#dcd9c9');for(let i=0;i<4;i++)B(x+.025,y+.05+i*.035,h+.012,ww-.05,.002,.001,'paint','#79827d')
 }
 const utility=(x:number,y:number,h:number)=>{
  B(x,y,h,.15,.025,.105,'plastic','#c9cec1','round')
  for(const xx of [x+.04,x+.10]){B(xx,y+.026,h+.045,.008,.003,.027,'paint','#38433d');B(xx+.018,y+.026,h+.045,.008,.003,.027,'paint','#38433d')}
 }
 if(kind==='alpha_radio'){
  const n=Math.max(1,Math.round(w/.9)),cw=w/n
  for(let i=0;i<n;i++){
   const x=i*cw
   // Recessed speaker cones and rims replace a flat dark circular decal.
   if(i%5===0||i%5===4)for(const dx of [.08,cw*.56]){
    B(x+dx+.035,.534,1.81,.18,.014,.17,'plastic','#1e2421','disc')
    B(x+dx+.079,.55,1.852,.092,.017,.087,'plastic','#303731','disc')
   }
   for(const xx of [x+.018,x+cw-.043])for(const hh of [.14,.72,1.54,2.08])B(xx,.491,hh,.012,.009,.012,'steel','#64716b','disc')
   if(i%5===0||i%5===4)for(let k=0;k<4;k++)B(x+.10+k*(cw-.20)/4,.553,i%5===0?.9:.29,.045,.038,.045,'plastic','#333b33','disc')
   // Cables terminate at the console, instead of a row of unattached rods.
   rail(x+.35,.79,x+.43,.65,.81,.008);rail(x+.43,.65,x+.56,.60,.81,.008)
  }
  paper(w-.68,.67,.807)
  a.push(...alphaCupParts(w-.29,.84,z+.811,.065,.09,'#9ba797'))
 }
 if(kind==='alpha_desk'&&skin!=='executive'){
  const top=a.find(p=>p.solid&&p.z-z>.7);if(top){top.surface='laminate';top.color='#c1b69e'}
  // Steel modesty stretcher and rubber feet; the knee opening stays clear.
  B(.13,.10,.59,w-.26,.025,.038,'metal','#535e58')
  for(const x of [.12,w-.14])for(const y of [.07,d-.09])B(x-.005,y-.005,0,.038,.038,.024,'plastic','#333b36')
  if(s.data?.facility||skin==='station'){paper(w-.34,.12,.763);B(.17,.14,.761,.27,.20,.025,'fabric','#586959');rail(.44,.28,.58,.31,.764,.008)}
 }
 if(kind==='alpha_swivel'||kind==='alpha_archive_chair'||kind==='alpha_executive_chair'){
  // Five spoke bases and twin caster silhouettes, with each spoke correctly oriented.
  for(let i=a.length-1;i>=0;i--)if(a[i].z-z<.14&&a[i].h<.10)a.splice(i,1)
  for(let i=0;i<5;i++){
   const t=i*Math.PI*2/5,r=Math.min(w,d)*.39,cx=w/2,cy=d/2,xx=cx+Math.cos(t)*r,yy=cy+Math.sin(t)*r
   rail(cx,cy,xx,yy,.10,.038,'#38453f')
   for(const off of [-.024,.024])B(xx-.028,yy+off-.009,.025,.058,.018,.058,'plastic','#252f2b','disc',-t)
  }
 }
 if(kind==='alpha_chair'){
  for(const xx of [.04,w-.06])B(xx,d-.085,.44,.025,.025,.34,'metal','#424e47')
  B(.04,d-.09,.29,w-.08,.025,.025,'metal','#424e47')
 }
 if(kind==='alpha_bunk'||kind==='alpha_bed'){
  for(const h of kind==='alpha_bunk'?[.39,1.37]:[.32]){
   for(let i=0;i<5;i++)B(w*.48+i*.07,.07,h+.291,.022,d-.14,.008,'fabric','#aca99a','round')
   B(.13,.125,h+.33,.38,d-.25,.012,'fabric','#c6c3b4','round')
  }
 }
 if(kind==='alpha_rack'){
  // A few deliberately empty bins and mismatched replacements reveal the shelf depth.
  const phase=Math.round(s.x*7+s.y*11)%5
  for(const p of a)if(p.surface==='plastic'&&p.color==='#202e86')p.color=phase===1?'#344968':'#273a6b'
  for(const xx of [.08,w-.12])B(xx,.04,0,.10,d-.08,.018,'metal','#737d70')
  for(const h of [.06,.516,.972,1.428,1.884])rail(.09,.022,w-.09,.022,h+.02,.018,'#7e8a7b')
 }
 if(kind==='alpha_labbench'||kind==='alpha_office_station'){
  utility(w-.33,.012,kind==='alpha_labbench'?1.10:1.03)
  if(kind==='alpha_office_station'){rail(.57,.18,.71,.08,.79,.007);rail(.71,.08,w-.17,.08,.79,.007)}
 }
 if(kind==='alpha_lab_island'){
  // Washable tray, pipette stand and specimen tubes stay on the work surface.
  B(w*.48,d-.31,.903,.42,.23,.02,'steel','#9ca99e')
  for(const xx of [w*.48,w*.48+.40])B(xx,d-.31,.92,.02,.23,.035,'steel','#89998e')
  B(w*.48,d-.31,.92,.42,.02,.035,'steel','#89998e')
  for(let i=0;i<4;i++){B(w*.49+i*.085,d-.26,.94,.027,.027,.14,'plastic','#d1d4bd','rod');B(w*.49+i*.085,d-.26,1.08,.029,.029,.025,'plastic',i%2?'#7b8d6b':'#8c6651','rod')}
 }
 if(kind==='alpha_fumehood'){
  B(.08,d-.045,.96,w-.16,.025,.035,'steel','#798d82')
  B(w-.15,d-.02,1.07,.06,.02,.28,'paint','#b6c2b1')
  for(let i=0;i<3;i++)B(w-.135,d+.002,1.11+i*.07,.028,.015,.028,'plastic',i===0?'#8d4d38':'#4f675b','disc')
 }
 if(kind==='alpha_lab_duct'){
  for(let x=.14;x<w;x+=1.3)for(const yy of [.04,d-.08])B(x,yy,.31,.025,.025,.10,'steel','#8d9c91')
 }
 if(kind==='alpha_light'&&skin!=='warm'&&skin!=='downlight'){
  // Real terminal sockets, centre ballast cover and fine protective wire supports.
  for(const xx of [.027,w-.067])for(const yy of [.028,d-.076])B(xx,yy,-.04,.04,.05,.04,'plastic','#bfc7bd')
  B(.07,d/2-.027,-.013,w-.14,.054,.036,'paint','#afb9af')
  for(let x=.25;x<w-.1;x+=.35)B(x,.02,-.054,.006,d-.04,.008,'steel','#88988d')
 }
 if(kind==='alpha_lab_shelf'){
  for(const xx of [.04,w-.085])B(xx,.025,-.1,.035,.035,1.4,'metal','#566359')
 }
 // Vents and low sockets on long, unobstructed internal walls. No extra draw material.
 if(kind==='alpha_wall'&&z===0&&w>2.7&&d<.25&&!['door_frame','wood','mushroom','aquila'].includes(skin)){
  utility(.46,d+.002,.28)
  if(w>5){const xx=w-.87;B(xx,d+.002,2.21,.46,.025,.24,'paint','#bbc3b6')
   for(let i=0;i<6;i++)B(xx+.025,d+.029,2.24+i*.029,.41,.006,.009,'paint','#68776c')}
 }
 return a
}
