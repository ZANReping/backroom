import * as THREE from 'three'
import {litMaterial,levelTexture,noiseTexture,getMaterialMode,configureSurfaceTexture} from './shared'
import {l2WorldUV} from './l2Materials'
export const l4WorldUV=l2WorldUV
export type L4Surface='floor'|'wall'|'ceiling'|'fabric'|'frame'|'edge'|'trim'|'desk'|'chair'|'door'|'facade'|'tile'
const cache=new Map<string,THREE.Material>()
export function l4Material(surface:L4Surface,style='officehall'):THREE.Material {
  const key=`${getMaterialMode()}:${surface}:${style}`,old=cache.get(key);if(old)return old
  const asset=surface==='floor'?'dirty_carpet':surface==='ceiling'?'ceiling_interior':surface==='fabric'||surface==='chair'?'denim_fabric':'white_plaster_02'
  const textured=['floor','ceiling','wall','fabric','chair','tile'].includes(surface)
  const texture=(map:string)=>{
    const t=levelTexture(`l4/${asset}_${map}.jpg`,()=>noiseTexture(map==='NormalGL'?'#8080ff':'#c2c0b9',map==='NormalGL'?'#8080ff':'#aaa9a4'))
    return configureSurfaceTexture(t,map==='Color'?THREE.SRGBColorSpace:THREE.NoColorSpace)
  }
  const colors:Record<L4Surface,string>={floor:style==='windowview'?'#717d7e':style==='open'?'#85827f':'#8e908b',wall:style==='open'?'#b8b6a8':'#bfbbad',ceiling:'#bcbeb5',fabric:'#788990',frame:'#20282a',edge:'#9fa7a5',trim:'#323432',desk:'#bdb9a3',chair:'#233447',door:'#a4b0aa',facade:'#66747c',tile:'#878b85'}
  const m=litMaterial({color:colors[surface],...(textured?{map:texture('Color'),normalMap:texture('NormalGL'),normalScale:new THREE.Vector2(surface==='floor'?.22:.10,surface==='floor'?.22:.10),roughnessMap:getMaterialMode()==='realistic'?texture('Roughness'):undefined}:{}),roughness:surface==='frame'?.42:surface==='desk'?.7:.98,metalness:surface==='frame'?.45:0,envBase:.04})
  if(textured){
    // This hook changes only surface color/UV shading: no displacement, discard
    // or alpha cutouts. Its wall rectangles remain valid opaque occluders.
    m.userData.occlusionOpaque=true
    m.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 l4Local;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n l4Local=position;')
      shader.fragmentShader='varying vec3 l4Local;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float fiber=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
        diffuseColor.rgb=diffuse*mix(.58,.96,pow(clamp(fiber,0.0,1.0),.65));
        ${surface==='wall'?`float h=clamp(l4Local.y,0.,2.9);float edgeShade=smoothstep(0.,.38,h)*smoothstep(0.,.35,2.9-h);float wear=texture2D(map,vMapUv*.17).r;diffuseColor.rgb*=mix(.71,1.,edgeShade)*mix(.88,1.03,wear);`:''}
        ${surface==='ceiling'||surface==='tile'?`vec2 tuv=vMapUv*vec2(1.666667,.833333);vec2 tile=abs(fract(tuv+.5)-.5);vec2 aa=max(fwidth(tuv),vec2(.002));vec2 line=1.-smoothstep(vec2(.003),vec2(.009)+aa,tile);diffuseColor.rgb*=1.-max(line.x,line.y)*.35;`:''}
      `)
    };m.customProgramCacheKey=()=>`l4-${surface}-aged-matte-v2`
  }
  if(surface==='facade'){
    // Continuous vertical floor rhythm, with unlit glazing and occasional offices.
    const fm=new THREE.MeshBasicMaterial({color:'#7c898f',fog:true})
    fm.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 officeUV;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n officeUV=uv;')
      shader.fragmentShader='varying vec2 officeUV;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 cell=fract(officeUV/vec2(2.5,3.2));
        float win=step(.14,cell.x)*step(cell.x,.86)*step(.3,cell.y)*step(cell.y,.86);
        float lit=step(.87,fract(sin(dot(floor(officeUV/vec2(2.5,3.2)),vec2(12.98,78.2)))*43758.54));
        diffuseColor.rgb*=mix(vec3(.62,.66,.67),mix(vec3(.12,.19,.23),vec3(.58,.62,.55),lit),win);
        #ifdef USE_FOG
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.35,.38),smoothstep(4.0,80.0,vFogDepth)*.84);
        #endif
      `)
    };fm.customProgramCacheKey=()=> 'l4-infinite-office-facade';cache.set(key,fm);m.dispose();return fm
  }
  cache.set(key,m);return m
}

