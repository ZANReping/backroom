import * as THREE from 'three'
import type { ExitInstance } from '../core/types'
import { l11Material,l11UnfinishedConcrete,L11_SURFACE_MAPS } from './l11Materials'
import { CityBatch } from './l11Batch'
import { l11PropGeometry } from './l11PropGeometry'
import type { L11ExitPart } from '../world/l11ExitGeometry'
import { makeCanvasCtx,toTex } from './shared'

export function addL11ExitParts(batch:CityBatch,parts:L11ExitPart[],root?:THREE.Matrix4,unfinished=false){
  for(const p of parts){const {geometry,uv,matrix}=l11PropGeometry({...p,surface:p.surface==='plaster'?'paint':p.surface,shape:'box',solid:true,ry:-(p.angle??0)})
    const reuse=unfinished&&p.surface==='concrete'
    if(reuse||p.surface==='brick'){
      // Same dominant-axis projection as L1, in the building frame so near/far
      // meshes agree. Compensate for the existing shared texture's 2m repeat.
      const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),v=new THREE.Vector3(),n=new THREE.Vector3(),nm=new THREE.Matrix3().getNormalMatrix(matrix),scale=reuse?.32*L11_SURFACE_MAPS.concrete.metres[0]:1
      for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(matrix);n.fromBufferAttribute(normal,i).applyMatrix3(nm).normalize();const top=Math.abs(n.y)>.55,xFace=Math.abs(n.x)>Math.abs(n.z);uv[i*2]=(top?v.x:xFace?v.z:v.x)*scale;uv[i*2+1]=(top?v.z:v.y)*scale}
    }
    batch.geometry(reuse?l11UnfinishedConcrete(p.color):l11Material(p.surface,p.color),geometry,root?matrix.premultiply(root):matrix,uv)
  }
}
const labels=new Map<string,THREE.Material>()
function label(text:string,bg:string,fg:string){
  const id=text+bg+fg,old=labels.get(id);if(old)return old
  const [canvas,ctx]=makeCanvasCtx(512,128);ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.strokeStyle=fg;ctx.lineWidth=5;ctx.strokeRect(8,8,496,112);ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;ctx.fillText(text,256,67,474)
  const mat=new THREE.MeshStandardMaterial({map:toTex(canvas),roughness:.75,side:THREE.DoubleSide});mat.userData.shared=true;labels.set(id,mat);return mat
}
/** A front at -Z matches the building's local door tangent and outward normal. */
export function buildL11Exit(e:ExitInstance):THREE.Group{
  const g=new THREE.Group(),a=new CityBatch(),kind=e.def.kind,W=e.l11?.width??1.4
  if(kind==='l11liftshaft'){
    // Core walls and guide rails belong to the building collision/LOD model.
    a.box(l11Material('metal','#4b5050'),0,2.4,-.18,W+.3,.12,.18);a.finish(g);return g
  }
  const indoor=kind==='basebeta'||kind==='l11officedoor'
  const wood=l11Material('rawwood',kind==='l11brickdoor'?'#fff0c5':'#ddc9a5',indoor),dark=l11Material('rawwood','#c2ab80',indoor),metal=l11Material('metal','#89816a')
  a.box(dark,0,1.15,0,W,2.3,.09)
  for(let i=0;i<6;i++){const {geometry,uv,matrix}=l11PropGeometry({shape:'box',solid:true,surface:'rawwood',grain:'y',x:-W/2+(i+.5)*W/6,y:1.15,z:-.058,w:W/6-.006,h:2.22,d:.035});a.geometry(wood,geometry,matrix,uv)}
  for(const x of [-W/2-.055,W/2+.055])a.box(dark,x,1.2,-.04,.11,2.4,.18)
  a.box(dark,0,2.37,-.04,W+.22,.12,.18)
  for(const y of [.17,1.03,2.13])a.box(wood,0,y,-.09,W-.03,.12,.045)
  a.box(metal,W*.34,1.05,-.14,.04,.19,.07);a.box(metal,W*.27,1.09,-.19,.2,.035,.035)
  if(kind==='l11brickdoor'){a.box(metal,0,.8,-.12,.32,.075,.025);a.box(metal,0,1.62,-.12,.075,.12,.03)}
  if(kind==='l11unfinisheddoor'){a.box(l11Material('metal','#747b75'),0,.08,-.09,W+.18,.1,.3)}
  a.finish(g)
  const panel=(text:string,bg:string,fg:string,w:number,h:number,x:number,y:number,z:number,parent=g)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),label(text,bg,fg));mesh.position.set(x,y,z);mesh.rotation.y=Math.PI;parent.add(mesh);return mesh}
  if(kind==='basebeta'){
    panel('EXIT  出口','#235448','#f0ead5',1.1,.28,0,2.65,-.1)
    const seals=new THREE.Group();seals.name='l11-archive-seals'
    for(const sign of [-1,1]){const strip=panel('档 案 封 存','#e3d9bc','#913d30',W*1.03,.18,0,1.35,-.13-sign*.002,seals);strip.rotation.z=sign*.42}
    g.add(seals)
    panel('磁带提交处 · 6 盘','#353e3a','#dfd5b8',.84,.21,-W/2-.59,1.65,-.1)
    const box=new CityBatch();box.box(l11Material('metal','#535a51'),-W/2-.59,1.18,.02,.55,.55,.28);box.box(l11Material('sealedglass','#151b17'),-W/2-.59,1.35,-.127,.4,.055,.01);box.finish(g)
  }else if(kind==='l11officedoor')panel(`OFFICE  ${((e.floor??1)+1)*100+4}`,'#c8c3ac','#333c38',.38,.1,0,1.83,-.125)
  return g
}
export function syncL11ExitSeal(root:THREE.Object3D,unlocked:boolean){const seal=root.getObjectByName('l11-archive-seals');if(seal)seal.visible=!unlocked}
