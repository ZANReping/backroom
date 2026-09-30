import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial, noiseTexture } from './shared'
import { l2WorldUV } from './l2Materials'
import type { GameMap } from '../world/mapgen'

export type L5Surface = 'plaster' | 'ivory' | 'ceiling' | 'plainCeiling' | 'amber' | 'wood' | 'walnut' | 'marble' | 'redMarble' | 'gold' | 'bronze' | 'damask' | 'redPanel' | 'frieze' | 'carpet' | 'plainCarpet' | 'lobbyCarpet' | 'border' | 'upholstery' | 'leaf' | 'stem' | 'pot' | 'petal'
  | 'goldPaper' | 'whitePaint' | 'ballroomPanel' | 'roseCarpet' | 'serviceFloor' | 'boilerFloor' | 'serviceCeiling' | 'steel' | 'blackSteel' | 'brick' | 'boilerPaint' | 'rust' | 'insulation' | 'greenDeck' | 'linen' | 'poolTile' | 'flesh' | 'egg'
const cache = new Map<string, THREE.Material>()
const spec: Record<L5Surface, [string, string?, number?, number?]> = {
  flesh:['#714135',undefined,.68,.01],egg:['#402014',undefined,.19,.11],
  goldPaper:['#c9ac78','Wallpaper001A',.96,.005], whitePaint:['#e3e0d6','@plaster',.96,.005],
  ballroomPanel:['#b7a183','Wallpaper001A',.91,.01],roseCarpet:['#bf9085','../l5_carpet.jpg',1,0],
  serviceFloor:['#777972','@concrete',.82,.07],boilerFloor:['#645e52','@concrete',.98,.01],serviceCeiling:['#d2d2cb','@plaster',.96,.02],
  steel:['#d2d4cc','@metal',.5,.42],blackSteel:['#282b29',undefined,.67,.12],
  brick:['#776354','../l2/Bricks006',.98,.015],boilerPaint:['#8d9c93','../l2/Rust004',.9,.03],
  rust:['#906241','../l2/Rust004',.96,.02],insulation:['#c9c4a4','@fabric',.97,.015],
  greenDeck:['#345a44','@concrete',.8,.04],linen:['#e2d8bd','@fabric',.97,.01],poolTile:['#d2d7c6','@tiles',.37,.23],
  plaster: ['#dbccb1', 'white_plaster_02', .92, .025], ivory: ['#eddec1', 'white_plaster_02', .82, .04],
  ceiling: ['#967f60', 'white_plaster_02', .94, .02], plainCeiling: ['#d4d0c4', 'white_plaster_02', .95, .02], amber: ['#a6814e', 'white_plaster_02', .9, .04],
  wood: ['#5e3c27', 'wood_floor', .55, .22], walnut: ['#746049', 'wood_floor', .5, .25],
  marble: ['#dedbd3', 'Marble005', .38, .28], redMarble: ['#92372b', 'Marble022', .48, .16],
  gold: ['#b3975f', undefined, .38, .55], bronze: ['#4b3321', undefined, .42, .4],
  damask: ['#e3c9a8', 'damask.jpg', .88, .03], frieze: ['#e4ccb0', 'frieze.jpg', .66, .12],
  redPanel: ['#7f161a', 'damask.jpg', .9, .025],
  carpet: ['#c0a38a', '../l5_carpet.jpg', 1, 0], plainCarpet: ['#b49b90', 'plain_carpet.jpg', 1, 0],
  lobbyCarpet: ['#e3dfc8', 'lobby_carpet.jpg', 1, 0], border: ['#dbbf9a', 'rug_border.jpg', 1, 0],
  upholstery: ['#c4a16c', 'fabric_pattern_05', .98, .01], leaf: ['#243c1f', undefined, .74, .06], stem: ['#4e5430'], pot: ['#252923', undefined, .5, .22], petal: ['#eee4ca', undefined, .74, .06],
}
const channels:Record<string,[string,string,string]>={
  '@plaster':['../l11_plaster.jpg','../l11_plaster_normal.jpg','../l11_plaster_roughness.jpg'],
  '@metal':['../l11_metal.jpg','../l11_metal_normal.jpg','../l11_metal_roughness.jpg'],
  '@concrete':['../l11_concrete.jpg','../l11_concrete_normal.jpg','../l11_concrete_roughness.jpg'],
  '@ceiling':['../settlements/ceiling_color.jpg','../settlements/ceiling_normalgl.jpg','../settlements/ceiling_roughness.jpg'],
  '@fabric':['../settlements/fabric_color.jpg','../settlements/fabric_normalgl.jpg','../settlements/fabric_roughness.jpg'],
  '@tiles':['../settlements/tiles_color.jpg','../settlements/tiles_normalgl.jpg','../settlements/tiles_roughness.jpg'],
}
export function l5Texture(name: string, data = false) {
  return configureSurfaceTexture(levelTexture(`l5/${name}`, () => noiseTexture(data ? '#8080ff' : '#b5a28a', data ? '#8080ff' : '#a99376')), data ? THREE.NoColorSpace : THREE.SRGBColorSpace)
}
export function l5Material(surface: L5Surface): THREE.Material {
  const key = `${getMaterialMode()}:${surface}`, hit = cache.get(key)
  if (hit) return hit
  const [color, asset, roughness = .85, envBase = .02] = spec[surface]
  const pbr=asset&&!/\.(jpg|png)$/.test(asset),maps=asset?(channels[asset]??[`${asset}_Color.jpg`,`${asset}_NormalGL.jpg`,`${asset}_Roughness.jpg`]):undefined
  const relief=surface==='goldPaper'?.4:surface==='whitePaint'?.16:['brick','rust','serviceFloor','insulation'].includes(surface)?.18:.035
  const mat = litMaterial({color, roughness, envBase, metalness: surface === 'gold' ? .65 : surface === 'bronze' ? .72 : surface==='steel'?.35:0,
    ...(asset ? {map: l5Texture(pbr ? maps![0] : asset)} : {}),
    ...(pbr ? {normalMap: l5Texture(maps![1], true), normalScale: new THREE.Vector2(relief, relief), ...(getMaterialMode() === 'realistic' && !['redMarble','boilerFloor','greenDeck','serviceFloor','boilerPaint','insulation'].includes(surface) ? {roughnessMap: l5Texture(maps![2], true)} : {})} : {}),
    side: surface === 'leaf' || surface === 'petal' ? THREE.DoubleSide : THREE.FrontSide,
  })
  if(surface==='flesh'){
    mat.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFleshPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFleshPosition=vec3(uv,0.);')
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vFleshPosition;
float fleshNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec4 a=sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1.,0.),vec2(127.1,311.7)),dot(i+vec2(0.,1.),vec2(127.1,311.7)),dot(i+vec2(1.,1.),vec2(127.1,311.7))))*43758.5453;vec4 h=fract(a);return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
`).replace('#include <map_fragment>',`#include <map_fragment>
      vec2 p=vec2(vFleshPosition.x+vFleshPosition.z*.71,vFleshPosition.y+vFleshPosition.z*.37);
      float n=fleshNoise(p*2.7)+.4*fleshNoise(p*7.3)+.16*fleshNoise(p*24.);
      float vein=1.-smoothstep(.022,.065,abs(fleshNoise(p*8.+n)-.48));
      diffuseColor.rgb*=mix(.58,1.2,n*.64)*(1.-vein*.30);`)}
    mat.customProgramCacheKey=()=> 'l5-nest-flesh'
  } else if (surface === 'redMarble') {
    // Keep the scanned stone veining, grading the base to rosso levanto and veins to ivory.
    mat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 stone = texture2D(map, vMapUv).rgb;
      float v = dot(stone, vec3(.299,.587,.114));
      float vein = smoothstep(.25,.58,v);
      diffuseColor.rgb = mix(vec3(.085,.012,.008)*(.65+v*.9),vec3(.60,.51,.41),vein*.85);`)}
    mat.customProgramCacheKey = () => 'l5-rosso-marble-v3'
  } else if (surface === 'redPanel') {
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float motif=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
      diffuseColor.rgb=mix(vec3(.105,.004,.007),vec3(.165,.013,.016),motif);`)}
    mat.customProgramCacheKey=()=> 'l5-red-silk-panel'
  } else if (surface==='roseCarpet') {
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float floral=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
      diffuseColor.rgb=mix(vec3(.20,.054,.063),vec3(.49,.28,.22),smoothstep(.012,.23,floral));`)}
    mat.customProgramCacheKey=()=> 'l5-ballroom-rose-carpet'
  } else if(surface==='boilerPaint'){
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float wear=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
      diffuseColor.rgb=mix(vec3(.14,.057,.023),vec3(.29,.35,.32)*(.75+wear*4.),smoothstep(.018,.065,wear));`)}
    mat.customProgramCacheKey=()=> 'l5-aged-boiler-paint'
  } else if(surface==='insulation'||surface==='linen'){
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float weave=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
      diffuseColor.rgb=diffuse*mix(.81,1.,weave);`)}
    mat.customProgramCacheKey=()=> `l5-cream-fabric-${surface}`
  } else if (['plaster','ivory','ceiling','plainCeiling','amber','goldPaper','whitePaint','ballroomPanel'].includes(surface)) {
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float grain=dot(texture2D(map,vMapUv).rgb,vec3(.299,.587,.114));
      ${surface==='goldPaper'?'grain=clamp((grain-.60)*4.,0.,1.);':''}
      diffuseColor.rgb=diffuse*mix(${['goldPaper','whitePaint'].includes(surface)?'.77':'.89'},1.,grain);`)}
    mat.customProgramCacheKey=()=>`l5-clean-plaster-${surface}`
  }
  cache.set(key, mat)
  return mat
}
export const l5WorldUV = l2WorldUV
/** Reuse generic terrain topology/door apertures, changing only material ownership. */
export function l5SurfaceBatches(geos: THREE.BufferGeometry[], m: GameMap, group: THREE.Group, kind: 'floor' | 'ceiling' | 'wall', fallback?: THREE.Material) {
  const buckets = new Map<L5Surface, THREE.BufferGeometry[]>()
  const legacy: THREE.BufferGeometry[] = []
  const target = (t: number) => [21,23,24,25,26,60,61,62,63,64,65,66,67,68].includes(t)
  for (const geo of geos) {
    geo.computeBoundingBox()
    const c = geo.boundingBox!.getCenter(new THREE.Vector3()), i = Math.floor(c.z) * m.w + Math.floor(c.x), tint = m.tint[i]
    // Whole wall boxes can border two rooms. Only retheme an unassigned backing wall
    // when it borders a remodeled floor; other room materials retain their vertex colours.
    const remodeled = target(tint) || (kind === 'wall' && !tint && [i-1,i+1,i-m.w,i+m.w].some(j=>m.tiles[j]===1&&target(m.tint[j])))
    if (fallback && !remodeled) { legacy.push(geo); continue }
    const surface: L5Surface = tint===68 ? 'flesh' : kind === 'wall' ? 'whitePaint' : kind === 'ceiling'
      ? tint===25?'serviceCeiling':tint===24||tint===67?'blackSteel':tint === 60 ? 'plainCeiling' : tint === 61 || tint === 62 ? 'amber' : tint===21?'ceiling':'ivory'
      : tint===23?'poolTile':tint===63||tint===64?'roseCarpet':tint===25?'serviceFloor':tint===24?'boilerFloor':tint===67?'greenDeck':tint === 60 ? 'plainCarpet' : tint === 61 ? 'marble' : [62,65,66,26].includes(tint) ? 'walnut' : 'carpet'
    geo.deleteAttribute('color')
    l5WorldUV(geo, m.inf?.ox ?? 0, m.inf?.oy ?? 0, surface === 'carpet'||surface==='roseCarpet' ? .22 : surface==='serviceCeiling'?1/2.4:surface === 'plainCarpet' ? 1.3 : surface === 'walnut' ? .3 : .5)
    const gs = buckets.get(surface) ?? []; gs.push(geo); buckets.set(surface, gs)
  }
  for (const [surface, gs] of buckets) {
    const merged = mergeGeometries(gs, false)
    if (merged) { const mesh = new THREE.Mesh(merged, l5Material(surface)); mesh.castShadow = kind === 'wall'; mesh.receiveShadow = true; group.add(mesh) }
    gs.forEach(geo => geo.dispose())
  }
  if (fallback) {
    if (legacy.length) { const mesh = new THREE.Mesh(mergeGeometries(legacy, false)!, fallback); mesh.castShadow = kind === 'wall'; mesh.receiveShadow = true; group.add(mesh); legacy.forEach(g=>g.dispose()) }
    else fallback.dispose()
  }
}
