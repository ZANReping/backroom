import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toiletParts, type ToiletStyle, type ToiletFinish } from '../content/toiletParts'
import { l11PropShape } from '../content/l11PropShapes'

/** Fresh owned geometry per instance; CPU source shapes are shared, materials stay with the scene factory. */
export function toiletGeometries(style: ToiletStyle = 'standard'): Map<ToiletFinish, THREE.BufferGeometry> {
  const buckets = new Map<ToiletFinish, THREE.BufferGeometry[]>(), result = new Map<ToiletFinish, THREE.BufferGeometry>()
  for (const part of toiletParts(style)) {
    const shape = l11PropShape(part), source = shape.geometry
    const geo = source.index ? source.toNonIndexed() : source.clone()
    geo.applyMatrix4(shape.matrix)
    const list = buckets.get(part.finish) ?? []; list.push(geo); buckets.set(part.finish, list)
  }
  for (const [finish, parts] of buckets) {
    const geo = mergeGeometries(parts)
    for (const part of parts) part.dispose()
    if (!geo) throw Error('Invalid toilet geometry: ' + finish)
    geo.name = 'toilet-' + finish; result.set(finish, geo)
  }
  return result
}
export function buildToilet(materials: Record<ToiletFinish, THREE.Material>, style: ToiletStyle = 'standard') {
  const root = new THREE.Group(); root.name = 'toilet-model'
  for (const [finish, geometry] of toiletGeometries(style)) {
    const mesh = new THREE.Mesh(geometry, materials[finish]); mesh.name = 'toilet-' + finish
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh)
  }
  return root
}

/** Open wooden latrine board, top at .46m when mounted at .42m. No decal concealing a solid top. */
export function latrineSeatGeometry(width: number, depth = .60) {
  const outline=new THREE.Shape([new THREE.Vector2(-width/2,-depth/2),new THREE.Vector2(width/2,-depth/2),new THREE.Vector2(width/2,depth/2),new THREE.Vector2(-width/2,depth/2)])
  const hole=new THREE.Path();hole.absellipse(0,0,.135,.16,0,Math.PI*2,true);outline.holes.push(hole)
  return new THREE.ExtrudeGeometry(outline,{depth:.04,steps:1,bevelEnabled:false,curveSegments:12}).rotateX(-Math.PI/2)
}
