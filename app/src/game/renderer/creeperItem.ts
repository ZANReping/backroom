import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildRefinedItemMesh } from './refinedItemMesh'
import { litMaterial } from './shared'

/** Existing rat-meat UV model with a small, batched pale fungal growth. */
export function buildCreepMeat(): THREE.Group {
  const group=buildRefinedItemMesh('ratmeat')
  group.name='creeper-meat'
  const pieces:THREE.BufferGeometry[]=[]
  for(const [x,y,z,r] of [[-.055,.026,.004,.016],[.005,.027,.01,.022],[.065,.02,-.008,.014],[-.01,.023,-.022,.009]]) {
    pieces.push(new THREE.SphereGeometry(r,8,6).scale(1,.75,1).translate(x,y,z))
  }
  const geometry=mergeGeometries(pieces)!
  for(const g of pieces)g.dispose()
  group.add(new THREE.Mesh(geometry,litMaterial({color:'#d9d6c8',roughness:.98})))
  group.userData.creepMeat=true
  return group
}
