import * as THREE from 'three'
import {Builder,type TradersAssets} from './tradersMeshes'
import {TRADERS_ENTRY_WIDTH,TRADERS_ENTRY_HEIGHT,type TradersEntry} from '../content/tradersLayout'

/** Full-size terminal doors. The opaque frosted panes hide the scene boundary
 * without refraction, an exterior scene, extra lights or an additional pass. */
export function* buildTradersGate(entry:TradersEntry,assets:TradersAssets):Generator<void,THREE.Group,unknown>{
 const root=new THREE.Group();root.name='traders-main-gate:'+entry.id
 const b=new Builder(assets),angle=entry.face+Math.PI,cos=Math.cos(angle),sin=Math.sin(angle)
 const x=entry.x-sin,z=entry.y-cos,w=TRADERS_ENTRY_WIDTH,h=TRADERS_ENTRY_HEIGHT
 root.userData.tradersGate={id:entry.id,width:w,height:h,wallX:x,wallY:z,angle}
 const box=(lx:number,y:number,lz:number,a:number,hh:number,d:number,surface:string,color:string)=>{
  const px=x+lx*cos+lz*sin,pz=z-lx*sin+lz*cos
  b.box(px-a/2,y,pz-d/2,a,hh,d,surface,color,true,angle)
 }
 let complete=false
 const steel='#8e9991',paint='#3f514b',rubber='#303b35',glass='#91a49c'
 try{
  // Real jamb thickness and a recessed door stop, flush with the outer wall.
  for(const side of [-1,1]){
   box(side*(w/2-.065),0,0,.13,h,.28,'steel',steel)
   box(side*(w/2+.105),.025,.04,.22,h+.08,.30,'stone','#ada78f')
   box(side*(w/2-.17),.035,.105,.045,h-.16,.055,'rubber',rubber)
   box(side*(w/2-.07),.02,.17,.17,.27,.04,'steel','#a6ada2')
  }
  box(0,h-.16,0,w,.16,.30,'steel',steel)
  box(0,.004,.02,w,.018,.42,'steel','#8e9991')
  // Fixed sidelights and a broad pair of leaves fill the 4.8 m opening.
  const leaf=1.60
  for(const side of [-1,1]){
   const cx=side*(leaf/2+.012),fixed=side*2.035
   box(fixed,.05,0,.65,.66,.065,'paint',paint)
   box(fixed,.76,0,.65,2.35,.035,'frosted',glass)
   box(side*1.68,0,.015,.09,h-.16,.17,'steel',steel)
   for(const edge of [-1,1])box(cx+edge*(leaf/2-.035),.035,.025,.07,2.93,.115,'steel',steel)
   box(cx,.035,.025,leaf,.075,.115,'steel',steel)
   box(cx,2.90,.025,leaf,.075,.115,'steel',steel)
   box(cx,.12,.025,leaf-.13,.71,.065,'paint',paint)
   box(cx,.13,.067,leaf-.18,.40,.022,'steel','#a6ada2')
   box(cx,.86,.025,leaf,.07,.115,'steel',steel)
   box(cx,.94,.025,leaf-.13,1.90,.028,'frosted',glass)
   // Fine embedded wire, plus a horizontal safety marking at eye level.
   for(let wire=-.55;wire<.6;wire+=.22)box(cx+wire,.99,.046,.005,1.80,.004,'steel','#687c6e')
   for(let y=1.12;y<2.8;y+=.22)box(cx,y,.046,leaf-.18,.005,.004,'steel','#687c6e')
   box(cx,1.48,.052,leaf-.17,.055,.009,'paint','#bfc6b6')
   const handleX=side*.21
   box(handleX,1.04,.105,.11,.51,.028,'steel','#687c6e')
   for(const y of [1.10,1.48])box(handleX,y,.145,.045,.035,.10,'steel','#a6ada2')
   box(handleX-.017,1.10,.19,.034,.415,.034,'brass','#a99b70')
   // Hinge barrels and an overhead closer give the door a mechanical attachment.
   for(const y of [.30,1.42,2.60])box(side*(leaf+.01),y,.092,.045,.13,.055,'steel','#a6ada2')
   box(cx,2.78,.115,.32,.065,.075,'steel','#687c6e')
   box(cx-side*.15,2.84,.15,.48,.022,.025,'steel','#a6ada2')
  }
  box(0,.04,.045,.018,2.94,.10,'rubber',rubber)
  // Signage is at the actual doorway, on its inward-facing side.
  box(0,3.52,.10,4.58,.73,.15,'paint','#30483e')
  box(0,3.50,.18,4.72,.045,.055,'brass','#a99b70')
  // v-market: one AI wayfinding board per gate (English first, Chinese second line) + a US-style EXIT lightbox.
  const sign=(key:string,lx:number,y:number,lz:number,ww:number,hh:number)=>b.sign(key,x+lx*cos+lz*sin,y,z-lx*sin+lz*cos,ww,hh,angle)
  sign('gate_'+entry.id,0,3.885,.18,4.5,.66)
  box(0,3.31,.14,.56,.2,.09,'paint','#e9e7e1')
  sign('exit_'+entry.id,0,3.41,.188,.52,.19)
  yield* b.finish(root)
  complete=true;return root
 }finally{b.dispose();if(!complete){root.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()});root.clear()}}
}
