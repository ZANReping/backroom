import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial } from './shared'

export const SIX_ITEM_TYPES = ['luckymilk', 'capacitor', 'skeleton', 'rabbit', 'pockets', 'fuyouyu'] as const
export type SixItemType = typeof SIX_ITEM_TYPES[number]
// Matches the reproducible atlas generator. UVs stay inside each extruded tile.
const TILE = { label: 0, glass: 1, cork: 2, bolt: 3, brass: 4, edge: 5, fur: 6, cap: 7, opal: 8, silver: 9, jade: 10, cord: 11, lid: 12, milk: 13, back: 14 } as const

function atlas(file: string, data = false) {
  const texture = levelTexture(`items-six/${file}.png`, () => {
    const rgba = file === 'normal' ? [128,128,255,255] : file === 'roughness' ? [180,180,180,255] : [174,173,153,255]
    const t = new THREE.DataTexture(new Uint8Array(rgba),1,1)
    t.needsUpdate = true
    return t
  })
  configureSurfaceTexture(texture, data ? THREE.NoColorSpace : THREE.SRGBColorSpace)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}

function surface(metalness = 0, roughness = .65) {
  return litMaterial({ color: '#ffffff', map: atlas('color'), normalMap: atlas('normal', true), normalScale: new THREE.Vector2(.45,.45),
    metalness, roughness, envBase: metalness > .3 ? .38 : .16,
    ...(getMaterialMode() === 'realistic' ? { roughnessMap: atlas('roughness', true) } : {}) })
}

/** Instance-owned geometry/materials, shared immutable file textures. */
class Parts {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  readonly root = new THREE.Group()
  add(geo: THREE.BufferGeometry, mat: THREE.Material, tile: number, position: number[] = [0,0,0], rotation: number[] = [0,0,0], scale: number[] = [1,1,1]) {
    // A homogeneous non-indexed layout permits a single draw per material.
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    // Lathe profiles close at the axis; remove zero-area pole triangles before upload.
    const positionAttr=g.getAttribute('position'),keep:number[]=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3()
    for(let i=0;i<positionAttr.count;i+=3){a.fromBufferAttribute(positionAttr,i);b.fromBufferAttribute(positionAttr,i+1).sub(a);c.fromBufferAttribute(positionAttr,i+2).sub(a);if(b.cross(c).lengthSq()>1e-18)keep.push(i,i+1,i+2)}
    if(keep.length!==positionAttr.count){const clean=new THREE.BufferGeometry();for(const name of Object.keys(g.attributes)){const attr=g.getAttribute(name),values=new Float32Array(keep.length*attr.itemSize);for(let i=0;i<keep.length;i++)for(let k=0;k<attr.itemSize;k++)values[i*attr.itemSize+k]=attr.array[keep[i]*attr.itemSize+k];clean.setAttribute(name,new THREE.BufferAttribute(values,attr.itemSize))}g.dispose();g=clean}
    g.clearGroups()
    const uv = g.getAttribute('uv')
    for (let i=0;i<uv.count;i++) uv.setXY(i, ((tile%4)*256+8+uv.getX(i)*240)/1024, 1-(Math.floor(tile/4)*256+8+(1-uv.getY(i))*240)/1024)
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)))
    const parts=this.buckets.get(mat)??[];parts.push(g);this.buckets.set(mat,parts)
  }
  finish(type: SixItemType) {
    for(const [material,parts]of this.buckets){
      const geometry=mergeGeometries(parts,false)
      for(const part of parts)part.dispose()
      if(!geometry)throw new Error(`Cannot merge ${type} geometry`)
      geometry.computeBoundingBox();geometry.computeBoundingSphere()
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`${type}-${material.transparent?'glass':material instanceof THREE.MeshBasicMaterial?'charge':'surface'}`
      this.root.add(mesh)
    }
    this.root.name=`${type}-detailed-model`;this.root.userData.sixItemModel=1
    this.root.userData.loreSource=type==='skeleton'||type==='rabbit'?'project-original':`object-${({luckymilk:28,capacitor:42,pockets:51,fuyouyu:101} as const)[type]}`
    return this.root
  }
}

const cylinder = (top:number,bottom:number,height:number,segments=12,open=false) => new THREE.CylinderGeometry(top,bottom,height,segments,1,open)
const torus = (radius:number,tube:number,segments=16,sides=4) => new THREE.TorusGeometry(radius,tube,sides,segments)
const sphere = (radius:number,width=12,height=6) => new THREE.SphereGeometry(radius,width,height)
function lathe(profile:number[][],segments=16) {
  // Start on -Z: printed UV center faces +Z and joins behind the bottle.
  return new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments,Math.PI)
}
function tube(points:number[][],radius:number,segments=10,sides=4) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,sides,false)
}

function milk(p:Parts) {
  const body=surface(),metal=surface(.65,.4),glass=surface(.06,.55)
  glass.transparent=true;glass.opacity=.14;glass.depthWrite=false;glass.side=THREE.FrontSide
  p.add(lathe([[0,-.145],[.065,-.145],[.073,-.13],[.073,.04],[.066,.078],[.043,.103],[.04,.142],[.044,.15],[.04,.158]],16),glass,TILE.glass)
  p.add(lathe([[0,-.136],[.062,-.136],[.068,-.12],[.068,.026],[.06,.063],[0,.063]],16),body,TILE.milk)
  p.add(lathe([[.0735,-.07],[.0735,.028]],24),body,TILE.label)
  p.add(cylinder(.044,.044,.015,16),metal,TILE.lid,[0,.163,0])
  p.add(torus(.043,.003,16,4),metal,TILE.lid,[0,.157,0],[Math.PI/2,0,0])
}

function capacitor(p:Parts) {
  const cork=surface(),glass=surface(.06,.55),charge=new THREE.MeshBasicMaterial({color:'#ffffff',map:atlas('color'),toneMapped:false})
  glass.transparent=true;glass.opacity=.14;glass.depthWrite=false;glass.side=THREE.FrontSide
  p.add(lathe([[0,-.135],[.064,-.135],[.076,-.118],[.079,-.055],[.071,.035],[.034,.077],[.03,.118],[.036,.121],[.034,.135]],16),glass,TILE.glass)
  p.add(cylinder(.032,.027,.044,12),cork,TILE.cork,[0,.143,0])
  p.add(tube([[-.017,.082,0],[.018,.044,.006],[-.018,.012,0],[.014,-.031,.006],[-.018,-.064,0],[.022,-.107,.01]],.0045,12,4),charge,TILE.bolt)
  p.add(tube([[-.018,.012,0],[-.045,.032,.012],[-.056,.007,.02]],.0028,5,4),charge,TILE.bolt)
  p.add(tube([[.014,-.031,.006],[.041,-.018,-.026],[.05,-.052,-.036]],.0028,5,4),charge,TILE.bolt)
}

function key(p:Parts) {
  const brass=surface(.7,.46)
  p.add(torus(.043,.009,20,6),brass,TILE.brass,[0,.11,0])
  p.add(cylinder(.01,.012,.177,10),brass,TILE.brass,[0,-.02,0])
  p.add(cylinder(.019,.019,.014,12),brass,TILE.edge,[0,.051,0])
  const outline=new THREE.Shape()
  outline.moveTo(.005,-.105);outline.lineTo(.052,-.105);outline.lineTo(.052,-.084);outline.lineTo(.036,-.084);outline.lineTo(.036,-.065);outline.lineTo(.056,-.065);outline.lineTo(.056,-.044);outline.lineTo(.005,-.044);outline.closePath()
  const bit=new THREE.ExtrudeGeometry(outline,{depth:.014,steps:1,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:1})
  bit.translate(0,0,-.007)
  // Explicit planar front/back UV; perimeter faces have their own side strip.
  const pos=bit.getAttribute('position'),norm=bit.getAttribute('normal'),uv=bit.getAttribute('uv')
  for(let i=0;i<pos.count;i++){
    if(Math.abs(norm.getZ(i))>.7)uv.setXY(i,.08+pos.getX(i)/.07*.74,.1+(pos.getY(i)+.11)/.075*.74)
    else uv.setXY(i,.85+pos.getZ(i)/.025*.1,(pos.getY(i)+.11)/.075)
  }
  p.add(bit,brass,TILE.edge)
}

function rabbit(p:Parts) {
  const fur=surface(0,.93),metal=surface(.65,.43)
  p.add(sphere(.051,12,7),fur,TILE.fur,[0,.002,0],[0,0,.10],[.8,1.85,.77])
  p.add(sphere(.054,12,7),fur,TILE.fur,[.004,-.067,.018],[.18,0,0],[.95,1.0,.82])
  for(let i=-1;i<=1;i++)p.add(sphere(.019,8,5),fur,TILE.fur,[i*.025,-.096,.043],[0,0,0],[.75,1.15,1])
  p.add(cylinder(.025,.029,.026,12),metal,TILE.cap,[-.007,.086,0])
  p.add(torus(.018,.004,16,4),metal,TILE.cap,[-.007,.117,0])
}

function pockets(p:Parts) {
  // Reference: two opposed chased silver leaves, gold beads/bezel, blue-green opal.
  // Gold and silver use separate atlas regions but one metal draw; veins are baked.
  const metal=surface(.82,.29),opal=surface(.025,.2)
  const outline=[[.022,.005],[.032,.035],[.045,.051],[.064,.053],[.083,.045],[.068,.034],
    [.091,.031],[.112,.019],[.094,.020],[.116,.007],[.140,.004],[.126,-.006],
    [.150,-.011],[.177,-.027],[.170,-.045],[.150,-.049],[.117,-.039],[.088,-.025],[.059,-.013],[.035,-.008]]
  for(const left of [false,true]){
    const leaf=new THREE.Shape(),last=outline[outline.length-1],first=outline[0]
    leaf.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2)
    for(let i=0;i<outline.length;i++){
      const point=outline[i],next=outline[(i+1)%outline.length]
      leaf.quadraticCurveTo(point[0],point[1],(point[0]+next[0])/2,(point[1]+next[1])/2)
    }
    const geo=new THREE.ExtrudeGeometry(leaf,{depth:.005,steps:1,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0015,bevelSegments:1,curveSegments:2})
    const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv')
    // Planar leaf UV matches the engraved vein paths in atlas tile 9, including bevels.
    for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/.19,(pos.getY(i)+.07)/.14)
    p.add(geo,metal,TILE.silver,[0,0,-.0025],[0,0,left?Math.PI:0],[.8,left?.96:.8,1])
    for(const [x,y]of [[.047,.023],[.068,.01],[.098,-.009],[.132,-.024]]){
      const sign=left?-1:1
      const bead=new THREE.IcosahedronGeometry(.0043,0),bp=bead.getAttribute('position'),bu=bead.getAttribute('uv')
      // Polyhedron UVs can wrap beyond 1 at the seam; planar bead UVs stay in the atlas.
      for(let i=0;i<bp.count;i++)bu.setXY(i,.5+bp.getX(i)/.0086,.5+bp.getY(i)/.0086)
      p.add(bead,metal,TILE.edge,[sign*x*.8,sign*y*(left?.96:.8),.008],[0,0,0],[1,1,.85])
    }
  }
  // A raised, closed setting and a domed cabochon; no pendant loop.
  p.add(cylinder(.032,.033,.011,16),metal,TILE.edge,[0,0,.008],[Math.PI/2,0,0],[1,1,.87])
  p.add(torus(.031,.0034,16,4),metal,TILE.edge,[0,0,.015],[0,0,0],[1,.87,1])
  p.add(sphere(.0295,12,7),opal,TILE.opal,[0,0,.017],[0,0,0],[1,.87,.46])
  // Back pin, hinge and catch make the new brooch identifiable from the reverse.
  p.add(cylinder(.002,.002,.19,8),metal,TILE.back,[0,0,-.014],[0,0,Math.PI/2])
  for(const x of [-.091,.091])p.add(new THREE.BoxGeometry(.009,.014,.011),metal,TILE.back,[x,0,-.009])
}

function jade(p:Parts) {
  const stone=surface(.015,.36),cord=surface(0,.9)
  // Broad, flattened nephrite bi disc, not a thin luminous torus.
  p.add(torus(.051,.025,24,8),stone,TILE.jade,[0,-.015,0],[0,0,0],[1,1,.48])
  p.add(tube([[-.013,.038,.006],[-.017,.097,0],[0,.151,-.001],[.02,.096,-.003],[.011,.038,-.005]],.0042,12,4),cord,TILE.cord)
  p.add(torus(.008,.0032,10,4),cord,TILE.cord,[0,.067,.013],[0,0,.45],[.8,1.2,1])
  p.add(tube([[0,.064,.012],[-.008,.042,.016],[-.006,.02,.015]],.003,5,4),cord,TILE.cord)
  p.add(tube([[.003,.064,.014],[.009,.043,.018],[.013,.031,.018]],.003,5,4),cord,TILE.cord)
}

export function buildSixItemMesh(type: SixItemType): THREE.Group {
  const parts=new Parts()
  switch(type){case 'luckymilk':milk(parts);break;case 'capacitor':capacitor(parts);break;case 'skeleton':key(parts);break;case 'rabbit':rabbit(parts);break;case 'pockets':pockets(parts);break;case 'fuyouyu':jade(parts);break}
  return parts.finish(type)
}
