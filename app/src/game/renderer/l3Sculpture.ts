import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {l3Material} from './l3Materials'

/** Sculpted surfaces, not box silhouettes: draped cloth, anatomical face, and
 * individually curved flight feathers. Authored locally, no external model license. */
export function l3Sculpture(angel=false,damage=0) {
  const root=new THREE.Group(),parts:THREE.BufferGeometry[]=[]
  const add=(g:THREE.BufferGeometry,x=0,y=0,z=0)=>{g.translate(x,y,z);parts.push(g)}
  const ell=(x:number,y:number,z:number,a:number,b:number,c:number)=>{const g=new THREE.SphereGeometry(1,16,12);g.scale(a,b,c);add(g,x,y,z)}
  const tube=(pts:number[][],r:number)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),18,r,8,false))
  const base=angel?.72:.45
  // Continuous cloth, asymmetric contrapposto and flowing flutes.
  const profile=[[.28,0],[.31,.08],[.25,.25],[.235,.5],[.205,.8],[.19,1.02],[.145,1.15],[.19,1.35],[.23,1.53],[.17,1.59]].map(([r,y])=>new THREE.Vector2(r,y))
  const robe=new THREE.LatheGeometry(profile,64),p=robe.getAttribute('position') as THREE.BufferAttribute
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),a=Math.atan2(p.getX(i),p.getZ(i)),fold=1+.095*Math.sin(a*13+y*2.6)+.036*Math.sin(a*23-y*4)
    p.setXYZ(i,p.getX(i)*fold+.045*Math.sin(y*2+damage*.35),y+base,p.getZ(i)*fold*.77)
  }
  robe.computeVertexNormals();add(robe)
  // Sash folds curve across chest and hips rather than parallel vertical rods.
  for(let i=0;i<8;i++)tube([[-.2,base+1.5-i*.035,.05],[-.12,base+1.32-i*.044,.17],[.11,base+1.28-i*.06,.19],[.24,base+1.21-i*.065,.035]],.012)
  for(let i=0;i<6;i++)tube([[-.23,base+.83+i*.037,.07],[-.12,base+.63+i*.03,.20],[.16,base+.74+i*.047,.13],[.21,base+1.08,.02]],.01)
  ell(-.10,base+.04,.18,.085,.035,.15);ell(.10,base+.045,.15,.08,.04,.14)
  const neck=base+1.63,head=base+1.83
  add(new THREE.CylinderGeometry(.06,.075,.16,12),.016,neck,0)
  if(angel||damage!==2) {
    ell(.016,head,0,.112,.16,.104)
    ell(.016,head-.035,.093,.029,.045,.049) // nose bridge / tip
    ell(-.039,head+.009,.095,.036,.013,.015);ell(.066,head+.009,.095,.036,.013,.015) // brow planes
    ell(.016,head-.089,.094,.035,.008,.013)
    ell(-.094,head-.007,.008,.027,.046,.021);ell(.123,head-.007,.008,.024,.045,.021)
    // Wavy locks frame the face and descend over the back of the neck.
    for(let i=0;i<15;i++){const a=i/15*Math.PI*2;const x=Math.sin(a)*.113,z=Math.cos(a)*.09;tube([[x,head+.095,z],[x*1.1,head+.16,z-.025],[x*1.06,head+.03,z-.065],[x*1.12,head-.17,z-.055]],.018)}
  }
  if(angel) {
    tube([[-.19,base+1.49,0],[-.37,base+1.42,.015],[-.52,base+1.73,.04]],.045)
    tube([[.19,base+1.49,0],[.4,base+1.48,.04],[.66,base+1.68,.1]],.04)
    ell(-.52,base+1.75,.04,.05,.065,.035);ell(.67,base+1.68,.1,.06,.027,.038)
    // Feather-shaped lofts taper to a curved point. Pair spreads like reference 12.
    for(const side of [-1,1])for(let i=0;i<15;i++) {
      const t=i/14,from=new THREE.Vector3(side*(.14+t*.38),base+1.49+t*.34,-.13)
      const tip=new THREE.Vector3(side*(.56+t*.76),base+1.66+t*.46,-.20-t*.16)
      const direction=tip.clone().sub(from),len=direction.length()
      const feather=new THREE.SphereGeometry(1,10,8);feather.scale(.065-t*.017,len*.57,.019)
      feather.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()))
      const mid=from.clone().add(tip).multiplyScalar(.5);add(feather,mid.x,mid.y,mid.z)
    }
    // Held trumpet: shaft and flared bell at the lowered end.
    tube([[-.32,base+2.07,.04],[-.53,base+1.77,.04],[-.87,base+1.35,.04]],.017)
    const bell=new THREE.CylinderGeometry(.026,.10,.23,20,1,true);bell.rotateZ(-.64);add(bell,-.9,base+1.31,.04)
  } else {
    for(const side of [-1,1]) {
      if(damage===1&&side===1)tube([[.21,base+1.49,0],[.29,base+1.16,.01],[.23,base+.99,.14]],.047)
      else if(damage===3)tube([[side*.21,base+1.5,0],[side*.32,base+1.26,.02],[side*.27,base+1.03,.12]],.048)
      else if(damage===4)tube([[side*.21,base+1.5,0],[side*.31,base+1.3,.02],[side*.09,base+1.19,.21]],.048)
      else tube([[side*.20,base+1.5,0],[side*.24,base+1.35,0]],.06)
    }
    if(damage===0||damage===5) { // theatrical mask carried beside the gown
      ell(.31,base+.64,.06,.12,.15,.065)
      tube([[.24,base+1.05,.09],[.36,base+.88,.075],[.31,base+.78,.07]],.018)
    }
    if(damage===4) { // folded arms cradle a shallow votive bowl
      const bowl=new THREE.SphereGeometry(.12,20,10,0,Math.PI*2,Math.PI/2,Math.PI/2);bowl.scale(1,.5,1);add(bowl,0,base+1.17,.20)
    }
    if(damage===5) { // veiled muse, distinct from the uncovered mask bearer
      for(const side of [-1,1])for(let i=0;i<7;i++)tube([[side*(.06+i*.013),head+.17,-.02],[side*(.13+i*.014),head-.02,-.03],[side*(.17+i*.012),base+1.38,-.06]],.024)
    }
  }
  const merged=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose())
  root.add(new THREE.Mesh(merged,l3Material('sanct',angel?'bronze':'marble')))
  const plinth=new THREE.Mesh(new THREE.CylinderGeometry(angel?.38:.33,angel?.43:.37,base,32),l3Material('sanct','black'));plinth.position.y=base/2;root.add(plinth)
  if(!angel){const foot=new THREE.Mesh(new THREE.BoxGeometry(.76,.18,.76),l3Material('sanct','black'));foot.position.y=.09;root.add(foot)}
  else root.scale.setScalar(1.55)
  root.name=angel?'l3-bronze-trumpet-angel':`l3-marble-muse-${damage}`
  return root
}
