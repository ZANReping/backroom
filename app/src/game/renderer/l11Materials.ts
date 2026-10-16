import * as THREE from 'three'
import { getMaterialMode, levelTexture, makeCanvasCtx } from './shared'

export type L11MaterialKind = 'concrete' | 'asphalt' | 'brick' | 'plaster' | 'tile' | 'metal' | 'wood' | 'bark' | 'grass' | 'paving' | 'limestone' | 'ceramic' | 'tactile' | 'glass' | 'sealedglass' | 'paint' | 'propwood' | 'rawwood' | 'fabric' | 'rubber' | 'paper' | 'porcelain' | 'plastic'

// UVs are in metres. Albedo, OpenGL normals and roughness must always share
// one physical repeat, including on oblique facades and across chunk seams.
export const L11_SURFACE_MAPS = {
  concrete: { prefix: 'l11_concrete', metres: [2, 2], normal: .34, roughness: .88 },
  asphalt: { prefix: 'l11_asphalt', metres: [4, 4], normal: .14, roughness: .96 },
  brick: { prefix: 'l11_brick', metres: [3, 1.5], normal: .65, roughness: .87 },
  plaster: { prefix: 'l11_plaster', metres: [2, 2], normal: .22, roughness: .88 },
  tile: { prefix: 'l11_tiles', metres: [3.6, 3.6], normal: .28, roughness: .5 },
  metal: { prefix: 'l11_metal', metres: [1.6, 1.6], normal: .24, roughness: .44 },
  wood: { prefix: 'l11_wood', metres: [3, 3], normal: .3, roughness: .64 },
  grass: { prefix: 'l11_grass', metres: [1.4, 1.4], normal: .65, roughness: .95 },
  paving: { prefix: 'l11_paving', metres: [2.4, 2.4], normal: .52, roughness: .91 },
  limestone: { prefix: 'l11_limestone', metres: [2, 2], normal: .28, roughness: .68 },
  ceramic: { prefix: 'l11_ceramic', metres: [1, 1], normal: .22, roughness: .4 },
  tactile: { prefix: 'l11_tactile', metres: [.8, .8], normal: .7, roughness: .82 },
  propwood: { prefix: 'l11_propwood', metres: [.8, .8], normal: .18, roughness: .62 },
  fabric: { prefix: 'l11_fabric', metres: [.4, .4], normal: .28, roughness: .98 },
  rawwood: { prefix: 'l11_rawwood', metres: [.8, .8], normal: .24, roughness: .96 },
  bark: { prefix: 'l11-bark/2k/color', metres: [.8, 1.6], normal: .2, roughness: .96 },
} as const

const materialCache = new Map<string, THREE.MeshStandardMaterial>()
/** Three replaces envMapIntensity with scene.environmentIntensity when no
 * material envMap is assigned. Preserve the city's per-surface response while
 * retaining one shared PMREM and the player's reflection strength setting. */
function cityEnvironmentScale(material:THREE.MeshStandardMaterial){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material)
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer)
    shader.uniforms.uL11EnvScale={get value(){return material.envMapIntensity}}
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uL11EnvScale;')
      .replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/\benvMapIntensity\b/g,'(envMapIntensity*uL11EnvScale)'))
  }
  const originalKey=key();material.customProgramCacheKey=()=>originalKey+'|l11-environment-scale-v1'
}
export function l11PrivacyGlass(){
  const key='privacy-glass:'+getMaterialMode(),hit=materialCache.get(key);if(hit)return hit
  // Translucent etched glass provides privacy without a noise normal map.
  const mat=l11Material('glass','#dce5df').clone();mat.opacity=.94;mat.roughness=.86;mat.envMapIntensity=.16
  cityEnvironmentScale(mat)
  mat.name='l11-privacy-glass';mat.userData={...mat.userData,shared:true,l11Privacy:true};materialCache.set(key,mat);return mat
}
let lampMaterial:THREE.MeshStandardMaterial|undefined
export function l11LampMaterial(){
  if(!lampMaterial){lampMaterial=l11Material('plastic','#eee9da',true).clone();cityEnvironmentScale(lampMaterial);lampMaterial.emissive.set('#fff2d5');lampMaterial.emissiveIntensity=.7;lampMaterial.userData={...lampMaterial.userData,shared:true,l11Luminaire:true};lampMaterial.name='l11-luminaire-diffuser'}
  return lampMaterial
}
export function l11TrafficLampMaterial(){
  const key='traffic-red:'+getMaterialMode(),hit=materialCache.get(key);if(hit)return hit
  const mat=l11Material('paint','#ed382c').clone();cityEnvironmentScale(mat);mat.emissive.set('#ff2310');mat.emissiveIntensity=2.4
  mat.name='l11-red-signal-lens';mat.userData={...mat.userData,shared:true};materialCache.set(key,mat);return mat
}

// Flat placeholders are used while licensed files load. City materials do not
// use procedural noise, including the fallback path.
function flatTexture(color: string, alpha = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvasCtx(1, 1)
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
  return new THREE.CanvasTexture(canvas)
}

function mapTexture(name: string, fallback: () => THREE.Texture, linear = false): THREE.Texture {
  const texture = levelTexture(name, fallback)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}

export function l11Material(kind: L11MaterialKind, tint?: string, interior = false): THREE.MeshStandardMaterial {
  const mode=getMaterialMode(),key = `${kind}:${tint ?? ''}:${interior}:${mode}`
  const cached = materialCache.get(key)
  if (cached) return cached

  const color = tint ?? (kind === 'sealedglass' ? '#263944' : kind==='rubber'?'#3d4541':kind==='plastic'?'#b9bbae':'#ffffff')
  const fallback = () => flatTexture('#ffffff')
  let map: THREE.Texture | undefined
  let normalMap: THREE.Texture | undefined
  let roughnessMap: THREE.Texture | undefined
  const surface = L11_SURFACE_MAPS[kind as keyof typeof L11_SURFACE_MAPS]
  if (surface) {
    const {prefix} = surface
    map = mapTexture(`${prefix}.jpg`, fallback)
    normalMap = mapTexture(kind==='bark'?'l11-bark/2k/normal.jpg':`${prefix}_normal.jpg`, () => flatTexture('#8080ff'), true)
    roughnessMap = mapTexture(kind==='bark'?'l11-bark/2k/roughness.jpg':`${prefix}_roughness.jpg`, () => flatTexture('#ffffff'), true)
    for (const texture of [map, normalMap, roughnessMap]) texture.repeat.set(1 / surface.metres[0], 1 / surface.metres[1])
  }

  const envBase = kind === 'metal' ? .6 : kind === 'glass' ? .85 : kind === 'sealedglass' ? .8 : interior ? .12 : .48
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    ...(map?{map}:{}),
    ...(normalMap?{normalMap}:{}),
    ...(roughnessMap?{roughnessMap}:{}),
    normalScale: new THREE.Vector2(surface?.normal ?? 1, surface?.normal ?? 1),
    roughness: surface?.roughness ?? (kind === 'glass' ? .12 : kind === 'sealedglass' ? .21 : kind==='porcelain'?.22:kind==='plastic'?.48:kind==='rubber'?.96:kind==='paper'?.94:.78),
    // Classic has no image-based lighting. Use a diffuse counterpart so
    // cabinets, window frames and railings retain their painted appearance.
    metalness: mode==='classic'?0:kind === 'metal' ? .65 : kind === 'sealedglass' ? .16 : 0,
    envMapIntensity: envBase,
    emissive: '#ffffff',
    ...(map?{emissiveMap:map}:{}),
    emissiveIntensity: 0,
  }
  const material = kind === 'glass'
    ? new THREE.MeshPhysicalMaterial({ ...params, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })
    : new THREE.MeshStandardMaterial({ ...params, transparent: false, side: THREE.DoubleSide })
  material.name = `l11-${key}`
  material.userData.shared = true
  material.userData.envBase = envBase
  material.userData.l11Surface = kind
  material.userData.l11Interior = interior
  if(kind==='asphalt'){
    // The licensed scan contains strong oxidised patches. A restrained grade
    // preserves its aggregate/roughness without turning the whole street into
    // a high-contrast mottled surface at pedestrian scale.
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat roadLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=vec3(.06)+vec3(roadLuma)*.11;')}
    material.customProgramCacheKey=()=> 'l11-asphalt-reference-grade-v2'
  }
  if(kind==='bark'){
    // The source scan is brown. The inspected street trees have pale grey
    // bark; grade the measured albedo in linear space, retaining its relief.
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat barkLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(barkLuma),.76)*1.75;')}
    material.customProgramCacheKey=()=> 'l11-pale-bark-v1'
  }
  if(!interior&&kind!=='glass'&&kind!=='sealedglass'){
    material.userData.l10Wettable=true
    material.userData.l10BaseRoughness=material.roughness
    material.userData.l10BaseEnv=envBase
  }
  cityEnvironmentScale(material)
  materialCache.set(key, material)
  return material
}
/** L1's unpainted concrete uses these same Concrete034 files. Keep its .24
 * normal strength and matte response, with city lighting (no L1 baked lights).
 * The caller projects UVs at .32 repeats/metre without mutating shared maps. */
export function l11UnfinishedConcrete(tint='#c4c2b4'){
  const key='unfinished-l1-concrete:'+tint+':'+getMaterialMode(),hit=materialCache.get(key);if(hit)return hit
  const mat=l11Material('concrete',tint).clone();mat.normalScale.set(.24,.24);mat.roughness=.86;mat.envMapIntensity=.12
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.72);')}
  mat.customProgramCacheKey=()=> 'l11-l1-bare-concrete-v1';cityEnvironmentScale(mat)
  mat.name='l11-unfinished-l1-concrete';mat.userData={...mat.userData,shared:true,envBase:.12,l10BaseRoughness:.86,l10BaseEnv:.12,l1ConcreteReuse:true}
  materialCache.set(key,mat);return mat
}
const leafMaterials=new Map<string,THREE.MeshStandardMaterial>()
export function l11CarPaint(tint:string){
  const mode=getMaterialMode(),key='car-paint:'+tint+':'+mode,hit=materialCache.get(key);if(hit)return hit
  const mat=new THREE.MeshPhysicalMaterial({color:tint,roughness:.31,metalness:mode==='classic'?0:.23,clearcoat:.65,clearcoatRoughness:.24,envMapIntensity:.55})
  cityEnvironmentScale(mat);mat.name='l11-car-paint';mat.userData={shared:true,envBase:.55,l11Surface:'paint'};materialCache.set(key,mat);return mat
}
export function l11LeafMaterial(tint='#71865a'){
  const hit=leafMaterials.get(tint);if(hit)return hit
  const map=mapTexture('l11-foliage/2k/leaves.png',()=>flatTexture('#ffffff',0))
  const normalMap=mapTexture('l11-foliage/2k/normal.jpg',()=>flatTexture('#8080ff'),true),roughnessMap=mapTexture('l11-foliage/2k/roughness.jpg',()=>flatTexture('#ffffff'),true)
  const color=new THREE.Color(tint).lerp(new THREE.Color('#fffce7'),.88)
  const leafMaterial=new THREE.MeshPhysicalMaterial({map,normalMap,normalScale:new THREE.Vector2(.08,.08),roughnessMap,alphaTest:.42,side:THREE.DoubleSide,roughness:1,specularIntensity:.12,color,emissive:'#809857',emissiveMap:map,emissiveIntensity:.035})
  // The scanned wax layer is very smooth in places. Bound its microfacet
  // response at street scale so small cards do not turn into white sky mirrors.
  leafMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.78);')
    // These normals describe the crown envelope, not each leaf-card plane.
    // Three's usual back-face flip would invert the whole envelope on half
    // the cards, creating black speckles independent of the actual sunlight.
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal*=faceDirection;')
  }
  leafMaterial.customProgramCacheKey=()=> 'l11-leaf-crown-normals-v2'
  leafMaterial.envMapIntensity=.28;cityEnvironmentScale(leafMaterial)
  leafMaterial.name='l11-cc0-leaves';leafMaterial.userData.shared=true;leafMaterial.userData.envBase=.28;leafMaterials.set(tint,leafMaterial);return leafMaterial
}

export function l11ArchitecturalGlass(){
  const key='architectural-glass:'+getMaterialMode(),hit=materialCache.get(key);if(hit)return hit
  const mat=new THREE.MeshPhysicalMaterial({color:'#3a5357',metalness:.18,roughness:.09,transparent:true,opacity:.64,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,envMapIntensity:1.1})
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float facing=abs(dot(normalize(vViewPosition),normal));
    diffuseColor.a=gl_FrontFacing ? .44+.44*pow(1.-facing,3.) : .16;
    #include <opaque_fragment>`)}
  mat.customProgramCacheKey=()=> 'l11-architectural-glass-fresnel-v1'
  cityEnvironmentScale(mat)
  mat.name='l11-architectural-glass';mat.userData={shared:true,envBase:1.1,l11Surface:'glass'};materialCache.set(key,mat);return mat
}
/** Clear retail glazing keeps furnishings visible through a finished facade. */
export function l11StorefrontGlass(){
  const key='storefront-glass:'+getMaterialMode(),hit=materialCache.get(key);if(hit)return hit
  const mat=new THREE.MeshPhysicalMaterial({color:'#a3c5c8',metalness:0,roughness:.12,specularIntensity:.25,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,envMapIntensity:.48})
  mat.name='l11-clear-shop-glass';mat.userData={shared:true,envBase:.48,l11Surface:'glass'};cityEnvironmentScale(mat);materialCache.set(key,mat);return mat
}

/** Smoked bronze office glass: open floors remain real transparent rooms;
 * closed storeys use the same tint and sky response on their opaque envelope. */
export function l11BronzeGlass(open=false,variant=0){
  const mode=getMaterialMode(),key=`bronze-glass:${open}:${variant}:${mode}`,hit=materialCache.get(key);if(hit)return hit
  const color=['#35443c','#3e4940','#2b3b35'][variant%3]
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:.17,metalness:mode==='classic'?0:.22,envMapIntensity:1.25,
    ...(open?{transparent:true,opacity:.42,depthWrite:false}:{}),side:THREE.DoubleSide,forceSinglePass:true})
  if(open){mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float facing=abs(dot(normalize(vViewPosition),normal));
    diffuseColor.a=gl_FrontFacing ? .25+.45*pow(1.-facing,3.) : .12;
    #include <opaque_fragment>`)};mat.customProgramCacheKey=()=> 'l11-bronze-glass-fresnel-v1'}
  cityEnvironmentScale(mat);mat.name='l11-bronze-office-glass';mat.userData={shared:true,envBase:1.25,l11Surface:open?'glass':'sealedglass'};materialCache.set(key,mat);return mat
}

/** The licensed limestone scan supplies subtle grain. Exterior cut stone has
 * much less colour variation than the paving made from the same source. */
export function l11FacadeStone(){
  const mode=getMaterialMode(),key='facade-limestone:'+mode,hit=materialCache.get(key);if(hit)return hit
  const mat=l11Material('limestone','#ffffff').clone();mat.normalScale.set(.055,.055);mat.roughness=.84
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float stoneGrain=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb=vec3(.46,.415,.335)*(1.+(stoneGrain-.32)*.2);`)}
  mat.customProgramCacheKey=()=> 'l11-cut-limestone-v1';cityEnvironmentScale(mat)
  mat.name='l11-cut-limestone-cladding';mat.userData={...mat.userData,shared:true,l11Surface:'limestone'};materialCache.set(key,mat);return mat
}
