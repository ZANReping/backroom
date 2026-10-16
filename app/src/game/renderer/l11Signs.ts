import * as THREE from 'three'
import type { Structure } from '../core/types'
import { L11_SIGNS, L11_SIGN_IDS, l11StreetSign } from '../content/l11Signs'
import { l11DecorDef } from '../content/l11Decor'
import { CityBatch } from './l11Batch'
import { l11Material } from './l11Materials'
import { levelTexture, makeCanvasCtx } from './shared'
import type { L11Building } from '../world/l11Types'
import { L11_VERTICAL_SIGNS,l11VerticalSign } from '../content/l11VerticalSigns'
import { l11VerticalSignMount } from '../world/l11VerticalSignMounts'
import { L11_INSPECTED_SIGNS } from '../content/l11ReferenceSigns'
import { l11ShopSigns } from '../world/l11ShopSigns'

const faces = new Map(L11_SIGNS.map(face => [face.id, face]))
let quality = 1
let material: THREE.MeshStandardMaterial | undefined
const bannerMaterials=new Map<string,THREE.MeshStandardMaterial>()
const casingGeometry = new THREE.BoxGeometry(1, 1, 1)
const inspectedMaterials=new Map<string,THREE.MeshStandardMaterial>()
const roundFace=new THREE.CircleGeometry(.5,24)
const roundCasing=new THREE.CylinderGeometry(.5,.5,1,24).rotateX(Math.PI/2)

function inspectedMaterial(id:string){
  const spec=L11_INSPECTED_SIGNS.find(s=>s.id===id)!
  const map=levelTexture(quality===0?spec.lowAlbedo:spec.albedo,()=>{const[c,ctx]=makeCanvasCtx(1,1);ctx.fillStyle='#353833';ctx.fillRect(0,0,1,1);return new THREE.CanvasTexture(c)})
  map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.anisotropy=quality===0?1:8
  let mat=inspectedMaterials.get(id)
  if(!mat){mat=new THREE.MeshStandardMaterial({map,roughness:185/255,metalness:.04,envMapIntensity:.18,alphaTest:spec.shape==='circle'?.35:0});mat.name='l11-inspected-sign-'+id;mat.userData={shared:true,envBase:.18};inspectedMaterials.set(id,mat)}
  mat.map=map;return mat
}

function signTexture() {
  const map = levelTexture(quality === 0 ? 'l11_signs_low.png' : 'l11_signs.png', () => {
    const [c, ctx] = makeCanvasCtx(1, 1)
    ctx.fillStyle = '#dedbcf'; ctx.fillRect(0, 0, 1, 1)
    return new THREE.CanvasTexture(c)
  })
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter
  map.anisotropy = quality === 0 ? 1 : quality === 1 ? 4 : 12
  return map
}

export function l11SignMaterial(): THREE.MeshStandardMaterial {
  const map = signTexture()
  if (!material) {
    // Flat printed faces need no sampled normal/roughness channels: these are
    // uniform values, matching the exported OpenGL normal and roughness maps.
    // One atlas/material serves all 32 signs, retaining accurate front/back UVs.
    material = new THREE.MeshStandardMaterial({ map, roughness: 185 / 255, metalness: .08, envMapIntensity: .18,
      emissive: '#ffffff', emissiveMap: map, emissiveIntensity: .025 })
    material.userData.shared = true; material.userData.envBase = .18
    material.name = 'l11-generated-full-signs'
  }
  material.map = map; material.emissiveMap = map
  return material
}

/** Returns true when existing scene texture references need refreshing. */
export function setL11SignQuality(next: number): boolean {
  const changed = (quality === 0) !== (next === 0)
  quality = next
  if (material) l11SignMaterial()
  for(const spec of L11_VERTICAL_SIGNS)if(bannerMaterials.has(spec.id))referenceBannerMaterial(spec.id)
  for(const spec of L11_INSPECTED_SIGNS)if(inspectedMaterials.has(spec.id))inspectedMaterial(spec.id)
  return changed && (!!material||bannerMaterials.size>0||inspectedMaterials.size>0)
}

function referenceBannerMaterial(id='pegasus'){
  const spec=l11VerticalSign(id),map=levelTexture(quality===0?spec.lowAlbedo:spec.albedo,()=>{
    const [c,ctx]=makeCanvasCtx(1,1);ctx.fillStyle='#bd591e';ctx.fillRect(0,0,1,1);return new THREE.CanvasTexture(c)
  })
  map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.anisotropy=quality===0?1:8
  let bannerMaterial=bannerMaterials.get(id)
  if(!bannerMaterial){bannerMaterial=new THREE.MeshStandardMaterial({map,roughness:185/255,metalness:.02,envMapIntensity:.18,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});bannerMaterial.name='l11-complete-vertical-'+id;bannerMaterial.userData={shared:true,envBase:.18};bannerMaterials.set(id,bannerMaterial)}
  bannerMaterial.map=map;return bannerMaterial
}
/** Printed face over a physical, collision-backed board with three brackets. */
export function addL11ReferenceBanner(batch:CityBatch,b:L11Building,root?:THREE.Matrix4){
  const mount=l11VerticalSignMount(b);if(!mount)return
  const {spec,x,y,z,angle,blade}=mount,c=Math.cos(angle),s=Math.sin(angle)
  const point=(u:number,v:number,w:number)=>[x+c*u+s*w,y+v,z-s*u+c*w]
  for(const side of blade?[-1,1]:[1]){
    const w=spec.width/2*side,h=spec.height/2,d=side*(spec.depth/2+.006)
    const pts=[point(-w,-h,d),point(w,-h,d),point(w,h,d),point(-w,h,d)],n=new THREE.Vector3(s*side,0,c*side)
    if(root){for(const p of pts)new THREE.Vector3(...p).applyMatrix4(root).toArray(p);n.transformDirection(root)}
    batch.quad(referenceBannerMaterial(spec.id),pts,n.toArray(),1,[[0,0],[1,0],[1,1],[0,1]])
  }
}

/** A full face with a shallow metal casing. Dimensions remain in world metres. */
export function addL11Sign(batch: CityBatch, id: string, x: number, y: number, z: number, angle = 0,
  width = 3, height = width / 4.2, doubleSided = false, casing = true, casingDepth?:number) {
  const face = faces.get(id),inspected=L11_INSPECTED_SIGNS.find(s=>s.id===id)
  if (!face&&!inspected) throw new Error(`Unregistered L11 sign: ${id}`)
  // A double-faced assembly encloses its 7–8 cm post between the two plates.
  // Keeping the faces outside the pole prevents it crossing the printed text.
  const c = Math.cos(angle), s = Math.sin(angle), depth = casing ? casingDepth??(doubleSided ? .1 : .055) : .006
  if (casing) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
      new THREE.Vector3(width + .015, height + .015, depth))
    batch.geometry(id==='famima'?l11Material('paint','#293331'):l11Material('metal', '#7c807d'), inspected?.shape==='circle'?roundCasing:casingGeometry, matrix)
  }
  const point = (px: number, py: number, pz: number) => [x + c * px + s * pz, y + py, z - s * px + c * pz]
  const [u0, v0, u1, v1] = face?.uv??[0,0,1,1], uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
  for (const side of doubleSided ? [1, -1] : [1]) {
    const w = width / 2 * side, h = height / 2, d = side * (depth / 2 + .002)
    if(inspected?.shape==='circle'){
      const p=point(0,0,d),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle+(side<0?Math.PI:0)),new THREE.Vector3(width,height,1))
      batch.geometry(inspectedMaterial(id),roundFace,matrix)
      continue
    }
    batch.quad(inspected?inspectedMaterial(id):l11SignMaterial(), [point(-w, -h, d), point(w, -h, d), point(w, h, d), point(-w, h, d)],
      [s * side, 0, c * side], 1, uv)
  }
}

export function addL11ShopSigns(batch:CityBatch,b:L11Building){
  for(const p of l11ShopSigns(b))addL11Sign(batch,p.spec.id,p.x,p.y,p.z,p.angle,p.spec.width,p.spec.height,p.spec.shape==='circle')
}

/** Decal variants stay attached to their registered prop's local axes. */
export function addL11PropSigns(batch: CityBatch, structure: Structure) {
  const def = l11DecorDef(structure.kind)
  if (!def) return
  const requested = String(structure.data?.signId ?? '')
  const id = (fallback: string) => L11_SIGN_IDS.has(requested) ? requested : fallback
  switch (structure.kind) {
    case 'l11_vertical_wall_sign':
    case 'l11_vertical_blade_sign':{
      const blade=structure.kind==='l11_vertical_blade_sign',spec=l11VerticalSign(requested||'hotel'),w=1.3,h=6.5
      for(const side of blade?[-1,1]:[-1]){
        const pts=blade?[[side*.066,0,-.12-w/2*side],[side*.066,0,-.12+w/2*side],[side*.066,h,-.12+w/2*side],[side*.066,h,-.12-w/2*side]]:[[w/2,0,-.066],[-w/2,0,-.066],[-w/2,h,-.066],[w/2,h,-.066]]
        batch.quad(referenceBannerMaterial(spec.id),pts,blade?[side,0,0]:[0,0,-1],1,[[0,0],[1,0],[1,1],[0,1]])
      }
      break
    }
    case 'l11_signal':
      if(requested==='hope')addL11Sign(batch,'hope',0,def.height-.75,0,0,1.25,.44,true,true,.16)
      break
    case 'l11_street_name':{
      const name=id(l11StreetSign(String(structure.data?.instanceId ?? 'design-road')))
      addL11Sign(batch,name, 0, def.height - .2, 0, 0, 1.62, name==='hope'?.57:.34, true)
      break
    }
    case 'l11_bus_stop':
      addL11Sign(batch, id('bus'), 0, def.height - .22, -.05, Math.PI, .49, .117)
      break
    case 'l11_bus_shelter':
      addL11Sign(batch, id('bus'), 0, def.height - .13, -def.d / 2 - .025, Math.PI, 1.65, .39)
      break
    case 'l11_parking_meter':
      addL11Sign(batch, 'parking', 0, 1.06, -.117, Math.PI, .21, .05, false, false)
      break
    case 'l11_ticket_machine':
      addL11Sign(batch, 'metro', 0, 1.6, -.265, Math.PI, .48, .115, false, false)
      break
    case 'l11_menu_board':
      addL11Sign(batch, id('cafe'), 0, .88, -.327, Math.PI, .54, .129, false, false)
      break
    case 'l11_market_stall':
      addL11Sign(batch, id('produce'), 0, 2.35, -def.d / 2 - .03, Math.PI, 1.55, .37)
      break
    case 'l11_newspaper_box':
      addL11Sign(batch, id('books'), 0, 1.005, -def.d / 2 - .025, Math.PI, .53, .126, false, false)
      break
    case 'l11_bus':
      addL11Sign(batch, 'bus', 0, def.height - .14, -def.d / 2 - .025, Math.PI, 1.05, .25)
      break
    case 'l11_park_bench':
      addL11Sign(batch, 'riverside', 0, def.height*.83, def.d*.28+.039, 0, .32, .076, false, false)
      break
  }
}
