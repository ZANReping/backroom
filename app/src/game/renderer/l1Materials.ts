import * as THREE from 'three'
import { getMaterialMode, litMaterial, noiseTexture, levelTexture } from './shared'
import { l1Profile } from '../world/l1Architecture'
import {l1PathPlasterAt} from '../world/l1Spatial'
import {installL1SurfaceField} from './l1SurfaceField'
import {installL1Lighting} from './l1Lighting'
import {installL1VaultMaterial} from './l1VaultMaterial'
import {l1BakedPointLights} from './l1BakedShader'
import {l0StaticPointMask} from './l0PointMask'
const cache=new Map<string,THREE.Material>()
export type L1EagleSkin='common'|'round'|'room'|'water'|'bright'|'clean'|'dry'|'dim'|'dark'
/** One look per 天鹰 reference photo: floor / wall(+columns) / ceiling scan names and an albedo gain. */
export const L1_EAGLE_SKINS:Record<L1EagleSkin,{floor:string;wall:string;ceil:string;gain:number}>={
  common:{floor:'common_floor',wall:'common_wall',ceil:'common_ceil',gain:.92},
  round:{floor:'round_floor',wall:'round_wall',ceil:'round_ceil',gain:.95},
  room:{floor:'room_floor',wall:'room_wall',ceil:'round_ceil',gain:.92},
  water:{floor:'water_floor',wall:'water_wall',ceil:'dark_ceil',gain:.95},
  bright:{floor:'bright_floor',wall:'bright_wall',ceil:'white_ceil',gain:.9},
  clean:{floor:'clean_floor',wall:'clean_wall',ceil:'white_ceil',gain:.9},
  dry:{floor:'dry_floor',wall:'dry_wall',ceil:'dry_ceil',gain:.9},
  dim:{floor:'dim_floor',wall:'dim_wall',ceil:'dark_ceil',gain:1},
  dark:{floor:'dark_floor',wall:'dark_wall',ceil:'dark_ceil',gain:1},
}
const L1_EAGLE_MEAN:Record<string,number>={bright_floor:.729,bright_wall:.932,clean_floor:.749,clean_wall:.875,common_ceil:.593,common_floor:.46,common_wall:.767,dark_ceil:.264,dark_floor:.22,dark_wall:.249,dim_floor:.362,dim_wall:.61,dry_ceil:.408,dry_floor:.622,dry_wall:.685,room_floor:.524,room_wall:.677,round_ceil:.566,round_floor:.768,round_wall:.755,water_floor:.569,water_wall:.455,white_ceil:.876}
const L1_EAGLE_SURF:Partial<Record<string,'floor'|'wall'|'ceil'>>={floor:'floor',wall:'wall',column:'wall',columnRaw:'wall',columnPaint:'wall',concrete:'wall',ceiling:'ceil'}
/** Repeats per metre. Colour, GL normal and roughness always use the same UV. */
export function l1SurfaceScale(variant:string,surface:'floor'|'wall'|'ceiling'|'concrete'){
  if(variant==='maintenance'&&surface==='wall')return .18
  if(variant==='fabled')return surface==='floor'?.45:surface==='ceiling'?.38:.32
  return surface==='floor'?.22:surface==='ceiling'?.24:.32
}
export function l1Texture(name:string,data=false):THREE.Texture {
  const t=levelTexture(name,()=>noiseTexture(data?'#8080ff':'#98998d',data?'#8080ff':'#7d7c71'))
  const mark=data?'data':'color'
  if(t.userData.l1Space!==mark){t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=4;t.userData.l1Space=mark;t.needsUpdate=true}
  return t
}
export function l1Material(variant:string,surface:'wall'|'brick'|'floor'|'ceiling'|'concrete'|'column'|'columnRaw'|'columnPaint'|'guard'|'metal'|'red'|'whitePipe'|'cable'|'peeling'|'leaf'|'plant'|'ground'|'wet'|'line'|'glass'):THREE.Material {
  const key=`${getMaterialMode()}:${variant}:${surface}`,hit=cache.get(key);if(hit)return hit
  // v3: 天鹰 skins — `parking@<skin>` swaps the floor/wall/column/ceiling scans for one of the
  // nine reference looks (public/textures/l1/eagle, see SOURCES.md).
  const [baseVariant,skin]=variant.split('@') as [string,L1EagleSkin|undefined]
  const eagleSurf=skin&&L1_EAGLE_SURF[surface]
  const p=l1Profile(baseVariant==='maintenance-plaster'?'maintenance':baseVariant)
  let prefix='l11_concrete',color=surface==='wall'?p.wall:surface==='floor'?p.floor:surface==='ceiling'?p.ceiling:'#c4c2b4'
  if(surface==='wall'&&variant==='storage')prefix='l11_plaster'
  if(variant==='maintenance-plaster'){prefix='l11_plaster';color='#b9cede'}
  if(surface==='metal'){prefix='l11_metal';color='#a6aaa7'}
  if(surface==='column')color=p.wall
  if(variant==='gothic'&&(surface==='column'||surface==='ceiling'))color='#8e877b'
  if(surface==='column'&&variant==='storage')color='#8c7a62'
  if(surface==='columnRaw')color=variant==='ouroboros'?'#888b89':'#a7a69e'
  if(surface==='columnPaint'){prefix='l11_plaster';color='#d8d9d2'}
  if(surface==='guard'){prefix='l11_metal';color='#a59664'}
  if(variant==='storage'&&(surface==='ceiling'||surface==='metal')){prefix=surface==='ceiling'?'l1/steel':'l11_metal';color=surface==='ceiling'?'#5f5044':'#76604a'}
  if(variant==='storage'&&surface==='concrete'){prefix='l11_plaster';color='#e3e3d8'}
  if(surface==='red'){prefix='l11_metal';color='#9f342b'}
  if(surface==='whitePipe'){prefix='l11_metal';color='#d4d5cc'}
  if(surface==='cable'){prefix='l11_metal';color='#343733'}
  // 传说段 = the L1 of the past (ref 传说段.webp): worn dark plank floor, dark board ceiling, ochre plaster, dark timber posts.
  const fabled=variant==='fabled'&&['floor','ceiling','column','columnRaw','wall'].includes(surface)
  const fabledWood=fabled&&surface!=='wall'
  if(fabled)color=surface==='floor'?'#8c8579':surface==='ceiling'?'#5b4636':surface==='wall'?'#a6874e':'#5a4334'
  if(fabled&&surface==='wall')prefix='l11_plaster'
  if(surface==='glass'){prefix='l11_plaster';color='#a3a18c'}
  if(variant==='gothic'&&surface==='columnPaint')color='#8f8a80' // v2 C: ref drums are dirty grey, not fresh paint
  if(variant==='ouroboros'&&(surface==='peeling'||surface==='column'))color='#948e82'
  if(variant==='ouroboros'&&surface==='whitePipe')color='#ebe8df'
  // v3 衔尾段 = an abandoned construction site (ref 衔尾段.png): raw screed, blockwork, splotched columns, insulation wrap.
  const OURO:Partial<Record<string,string>>={floor:'floor',wall:'plaster',peeling:'beige',column:'column',columnRaw:'column',columnPaint:'patch',whitePipe:'spray',concrete:'plaster',ceiling:'floor'}
  const ouro=baseVariant==='ouroboros'?OURO[surface]:undefined
  const plant=surface==='plant'
  const gardenGround=baseVariant==='garden'&&surface==='ground'
  const continuous=!ouro&&!fabledWood&&(surface==='floor'||surface==='ceiling'||surface==='wall'&&!variant.startsWith('maintenance'))
  const peeling=surface==='peeling'&&!ouro
  const ground=surface==='ground'
  const foliage=surface==='leaf'
  const custom=peeling?'peeling':ground?'ground':undefined
  if(custom||foliage)color='#ffffff'
  if(foliage)color='#506d38'
  if(ground)color='#7ea650'
  const masonry=variant==='maintenance'&&surface==='wall'||surface==='brick'
  if(surface==='brick')color='#c3c4bc'
  const wornFloor=surface==='floor'&&!ground&&!fabledWood&&!ouro
  const plasterCeiling=surface==='ceiling'&&['parking','maintenance','aisle'].includes(baseVariant)
  if(plasterCeiling)prefix='l11_plaster'
  if(surface==='ceiling'&&baseVariant==='parking')color='#8e918a'
  // The reference paint is smooth, with faint mottling rather than exposed render.
  const plaster=prefix==='l11_plaster'&&!ouro
  const woodName=surface==='floor'?'old_wood_floor':'dark_planks'
  const map=plant?l1Texture('l1/garden/atlas.png'):gardenGround?l1Texture('l1/garden/ivyground.jpg'):ouro?l1Texture(`l1/ouro/${ouro}.jpg`):fabledWood?l1Texture(`l1/fabled/${woodName}_diff.jpg`):l1Texture(foliage?'l1/polyhaven/leaves_diff.jpg':wornFloor?'l3/polyhaven/concrete_floor_worn_001_Color.jpg':masonry?'l3/polyhaven/painted_brick_Color.jpg':custom?`l1/${custom}.png`:`${prefix}.jpg`)
  const mat=litMaterial({map,color,side:foliage?THREE.DoubleSide:THREE.FrontSide,
    ...(plant||ouro||gardenGround?{}:foliage?{alphaTest:.45,alphaMap:l1Texture('l1/polyhaven/leaves_alpha.jpg',true),normalMap:l1Texture('l1/polyhaven/leaves_nor_gl.jpg',true),normalScale:new THREE.Vector2(.4,.4),roughnessMap:getMaterialMode()==='realistic'?l1Texture('l1/polyhaven/leaves_rough.jpg',true):undefined}:{normalMap:l1Texture(wornFloor?'l3/polyhaven/concrete_floor_worn_001_NormalGL.jpg':masonry?'l3/polyhaven/painted_brick_NormalGL.jpg':custom?`l1/${custom}-normal.png`:`${prefix}_normal.jpg`,true),normalScale:new THREE.Vector2(masonry?.1:plaster?.045:surface==='floor'?.14:.24,masonry?.1:plaster?.045:surface==='floor'?.14:.24),roughnessMap:getMaterialMode()==='realistic'?l1Texture(wornFloor?'l3/polyhaven/concrete_floor_worn_001_Roughness.jpg':masonry?'l3/polyhaven/painted_brick_Roughness.jpg':custom?`l1/${custom}-rough.png`:`${prefix}_roughness.jpg`,true):undefined}),
    ...(fabledWood?{normalMap:l1Texture(`l1/fabled/${woodName}_nor_gl.jpg`,true),normalScale:new THREE.Vector2(.8,.8),...(getMaterialMode()==='realistic'?{roughnessMap:l1Texture(`l1/fabled/${woodName}_rough.jpg`,true)}:{})}:{}),
    roughness:surface==='glass'?.32:surface==='wet'?.12:surface==='metal'?.48:.86,metalness:surface==='metal'||surface==='red'?(variant==='storage'?.18:.55):0,envBase:surface==='wet'?.7:.12,
  })
  if(plant){
    mat.side=THREE.DoubleSide;mat.alphaTest=.5;mat.transparent=false;mat.normalMap=null;if(mat instanceof THREE.MeshStandardMaterial)mat.roughnessMap=null;mat.color.set('#c4cfb8');if(mat instanceof THREE.MeshStandardMaterial)mat.roughness=.8
  }
  if(ouro){
    // v3.2: keep the shared concrete normal map. Swapping in per-surface ouro normal maps after creation
    // reproducibly lost the WebGL context (SwiftShader) whenever 衔尾段 came into view.
    mat.normalMap=l1Texture('l11_concrete_normal.jpg',true);mat.normalScale.set(.24,.24)
    if(mat instanceof THREE.MeshStandardMaterial)mat.roughnessMap=null
    mat.color.setScalar(surface==='ceiling'?.08:ouro==='floor'?.4:ouro==='spray'?.92:ouro==='plaster'?.78:.85)
    // v3.2: multi-finish surfaces read one 2×2 atlas through the existing map sampler (no extra
    // texture units — extra samplers broke shader linking on low-unit GPUs / SwiftShader).
    const ouroAtlas=`vec4 ouroTex(vec2 tuv,float tile){vec2 o=vec2(mod(tile,2.),1.-floor(tile/2.))*.5;return textureGrad(map,fract(tuv)*.49+.005+o,dFdx(tuv)*.49,dFdy(tuv)*.49);}
float ouroH(float x){return fract(sin(x*127.1)*43758.5453);}
`
    if(ouro==='floor')mat.color.setRGB(.34,.325,.3)
    // v3.4: sprayed fireproofing reads as a soft continuous coat; damp the shared concrete relief so it doesn't look gravelly
    if(ouro==='spray')mat.normalScale.set(.3,.3)
    if(ouro==='beige'){
      // Two-tone column (ref right column): soot-blackened top over beige spotted paint, ragged burn line.
      // Side-face UV is (x|z, y)*.32, so world height = vMapUv.y/.32. Atlas: 0 beige, 1 soot.
      mat.map=l1Texture('l1/ouro/colatlas.jpg')
      const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
      mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer)
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        float oy=vMapUv.y/.32,ou=vMapUv.x/.32;
        float split=1.45+.5*ouroH(floor(ou/.8)*3.1)+.18*sin(ou*9.)+.1*sin(ou*23.+oy);
        float sk=smoothstep(split-.25,split+.35,oy);
        vec4 sampledDiffuseColor=mix(ouroTex(vMapUv,0.),ouroTex(vMapUv*.55,1.)*.7,sk);
        diffuseColor*=sampledDiffuseColor;`).replace('void main() {',ouroAtlas+'void main() {')}
      mat.customProgramCacheKey=()=>key+'|l1-ouro-twotone-v2'
    }
    if(ouro==='plaster'){
      // Walls (ref): mostly spotted grey skim plaster, some bare blockwork bays and pink/yellow patched
      // panels, and on many bays a black-painted band above ~3 m. Bays ≈ 4.5 m along the wall.
      // Atlas: 0 plaster, 1 block, 2 pink patch, 3 black block.
      mat.map=l1Texture('l1/ouro/wallatlas.jpg')
      const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
      mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer)
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        float oy=vMapUv.y/.32,bay=floor(vMapUv.x/1.45),bx=fract(vMapUv.x/1.45);
        float pick=ouroH(bay*1.7+3.),band=ouroH(bay*2.3+11.),top=2.75+.25*ouroH(bay*5.1);
        float tile=0.;
        if(pick<.2&&oy<2.7&&bx>.12&&bx<.78)tile=2.;else if(pick>.72)tile=1.;
        if(band>.45&&oy>top)tile=3.;
        vec4 sampledDiffuseColor=ouroTex(tile==2.?vMapUv*1.2:vMapUv,tile);
        if(tile==3.)sampledDiffuseColor.rgb*=.75;
        diffuseColor*=sampledDiffuseColor;`).replace('void main() {',ouroAtlas+'void main() {')}
      mat.customProgramCacheKey=()=>key+'|l1-ouro-walls-v3'
    }
  }
  if(gardenGround){
    // 花园段 ground: creeping ivy, cushion moss and leaf-litter patches blended by a slow world-space field.
    const moss=l1Texture('l1/garden/moss.jpg'),litter=l1Texture('l1/garden/litter.jpg')
    mat.userData.l1ExtraTextures=[moss,litter]
    mat.normalMap=l1Texture('l1/garden/ivyground_nor.jpg',true);mat.normalScale=new THREE.Vector2(.6,.6);if(mat instanceof THREE.MeshStandardMaterial)mat.roughnessMap=null;mat.color.set('#d0d6c4')
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.uniforms.gMoss={value:moss};shader.uniforms.gLitter={value:litter}
      shader.fragmentShader=`uniform sampler2D gMoss;uniform sampler2D gLitter;
      float gH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float gN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+vec2(1,1)),f.x),f.y);}
      `+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec2 gUv=vMapUv*.5;
      vec4 sampledDiffuseColor=texture2D(map,gUv);
      float gF=gN(vMapUv*.045)*.65+gN(vMapUv*.13+7.)*.35;
      float gL=gN(vMapUv*.07+31.);
      vec3 gC=mix(sampledDiffuseColor.rgb,texture2D(gMoss,gUv*.9).rgb,smoothstep(.42,.62,gF));
      gC=mix(gC,texture2D(gLitter,gUv*1.1).rgb,smoothstep(.66,.8,gL)*.85);
      diffuseColor.rgb*=gC;`)}
    mat.customProgramCacheKey=()=>key+'|l1-garden-ground-v1'
  }
  if(plaster){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat paintL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.66,.82,smoothstep(.025,.65,paintL));')}
    mat.customProgramCacheKey=()=>key+'|l1-smooth-painted-plaster-v3'
  }
  if(masonry){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat plasterL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.58,.89,smoothstep(.015,.58,plasterL));')}
    mat.customProgramCacheKey=()=>key+'|l1-white-painted-brick-v2'
  }
  if(wornFloor){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=diffuse*clamp(sampledDiffuseColor.rgb*1.65,vec3(.04),vec3(.82));')}
    mat.customProgramCacheKey=()=>key+'|l1-worn-floor'
  }
  if(variant==='storage'&&['ceiling','metal','whitePipe'].includes(surface)){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat steelPaintL=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.42,.72,smoothstep(.02,.7,steelPaintL));')}
    mat.customProgramCacheKey=()=>key+'|l1-painted-steel-v1'
  }
  if(surface==='column'||surface==='columnRaw'){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float footHeight=vMapUv.y/.32;
      float stainNoise=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
      float stainTop=.20+.27*smoothstep(.04,.4,stainNoise);
      float footStain=(1.-smoothstep(stainTop,stainTop+.32,footHeight))*(.08+.13*smoothstep(.02,.32,stainNoise));
      diffuseColor.rgb*=1.-footStain;`)}
    mat.customProgramCacheKey=()=>key+'|l1-column-footwear-v3'
  }
  if(mat instanceof THREE.MeshStandardMaterial&&!['wet','metal','red','cable','whitePipe','glass'].includes(surface)){
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat)
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,${plaster?'.52':surface==='floor'?'.55':'.72'});`)}
    const priorKey=key();mat.customProgramCacheKey=()=>priorKey+'|l1-matte-concrete-v2'
  }
  if(surface==='wet'){
    mat.transparent=true;mat.opacity=.38;mat.depthWrite=false
    if(mat instanceof THREE.MeshStandardMaterial){mat.roughnessMap=null;mat.color.set('#515953')}
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{
      prior.call(mat,shader,renderer)
      // The floor below already receives baked native light and the reflector
      // images the actual tubes. Native point-light specular here creates a
      // second, round highlight unrelated to their long shape. Portable lights
      // remain live, including the flashlight and thrown glowsticks.
      shader.uniforms.l1BakedMask=l0StaticPointMask
      shader.fragmentShader='uniform float l1BakedMask[128];\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',l1BakedPointLights(THREE.ShaderChunk.lights_fragment_begin))
      shader.vertexShader='attribute float l1WetEdge;varying float vL1WetEdge;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvL1WetEdge=l1WetEdge;')
      shader.fragmentShader='varying float vL1WetEdge;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.a*=smoothstep(0.,.8,vL1WetEdge);')
    }
    mat.customProgramCacheKey=()=>key+'|l1-wet-edge-reflected-native'
  }
  if(surface==='line'){
    // Worn parking paint inherits the existing floor scan instead of a uniformly
    // bright strip. World UVs keep the wear continuous across streaming edges.
    mat.map=l1Texture('l3/polyhaven/concrete_floor_worn_001_Color.jpg');mat.color.set('#b9b39a')
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat stripeWear=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=diffuse*mix(.3,.8,smoothstep(.025,.45,stripeWear));')}
    mat.customProgramCacheKey=()=>key+'|l1-worn-parking-paint-v1'
  }
  if(continuous)installL1SurfaceField(mat,surface as 'floor'|'wall'|'ceiling',{ground:l1Texture('l1/ground.png'),peeling:l1Texture('l1/peeling.png'),groundNormal:l1Texture('l1/ground-normal.png',true),peelingNormal:l1Texture('l1/peeling-normal.png',true)})
  if(variant==='gothic'&&(surface==='column'||surface==='ceiling'))installL1VaultMaterial(mat)
  if(eagleSurf){
    // v3.1 (user: keep the concrete feel): the original concrete scan stays the albedo; the reference-look texture
    // only adds a soft, large-scale colour cast and stain variation (mip-biased so no rocky micro detail).
    const sk=L1_EAGLE_SKINS[skin!],name=sk[eagleSurf],mean=L1_EAGLE_MEAN[name]??.6,tex=l1Texture(`l1/eagle/${name}.jpg`)
    mat.userData.l1ExtraTextures=[tex]
    const shade=Math.min(1.25,Math.max(.5,Math.pow(mean/.6,.55)))
    const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey()
    mat.onBeforeCompile=(shader,renderer)=>{prior.call(mat,shader,renderer);shader.uniforms.l1EagleTex={value:tex}
      shader.fragmentShader='uniform sampler2D l1EagleTex;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 eT=texture2D(l1EagleTex,vMapUv*.45,3.).rgb;float eL=max(dot(eT,vec3(.2126,.7152,.0722)),.04);
      vec3 eTint=clamp(eT/eL,vec3(.6),vec3(1.5));
      diffuseColor.rgb*=mix(vec3(1.),eTint,.4)*mix(1.,clamp(eL/${mean.toFixed(3)},.6,1.4),.3)*${shade.toFixed(3)};`)}
    mat.customProgramCacheKey=()=>key+'|l1-eagle-tint-'+name
  }
  installL1Lighting(mat)
  mat.name=`l1-${variant}-${surface}`;mat.userData.l1Shared=true;cache.set(key,mat);return mat
}
export function l1WorldUV(geo:THREE.BufferGeometry,ox=0,oz=0,scale=.32) {
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv')
  if(!uv)return
  for(let i=0;i<p.count;i++){
    const top=Math.abs(n.getY(i))>.55,xFace=Math.abs(n.getX(i))>Math.abs(n.getZ(i))
    // Dominant-axis projection: moving along a wall never samples a diagonal of the scan.
    uv.setXY(i,(top?p.getX(i)+ox:xFace?p.getZ(i)+oz:p.getX(i)+ox)*scale,(top?p.getZ(i)+oz:p.getY(i))*scale)
  }
}

/** A tile wall is a full box: classify its faces, not its solid-centre position. */
export function l1PathWallFaces(geo:THREE.BufferGeometry,seed:number,ox:number,oz:number){
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),index=geo.index
  const groups=[{p:[] as number[],n:[] as number[]},{p:[] as number[],n:[] as number[]}]
  for(let i=0;i<(index?.count??p.count);i+=3){
    const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k)
    const x=ids.reduce((a,j)=>a+p.getX(j)+n.getX(j)*.01,0)/3+ox,z=ids.reduce((a,j)=>a+p.getZ(j)+n.getZ(j)*.01,0)/3+oz
    const a=groups[l1PathPlasterAt(seed,x,z)?1:0]
    for(const j of ids){a.p.push(p.getX(j),p.getY(j),p.getZ(j));a.n.push(n.getX(j),n.getY(j),n.getZ(j))}
  }
  return groups.map((a,i)=>{
    if(!a.p.length)return null
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(a.p.length/3*2),2));g.setIndex(Array.from({length:a.p.length/3},(_,i)=>i))
    l1WorldUV(g,ox,oz,i?.32:.18);return g
  })
}
export function disposeL1Owned(o:THREE.Object3D){
  const mesh=o as THREE.Mesh;if(!mesh.material)return
  for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(mat.userData.l1Owned&&!mat.userData.l1Disposed){if(mat.userData.settlementLabelTexture)(mat as THREE.MeshBasicMaterial).map?.dispose();mat.dispose();mat.userData.l1Disposed=true}
  }
}
export function disposeL1Materials(){for(const mat of cache.values())mat.dispose();cache.clear()}
