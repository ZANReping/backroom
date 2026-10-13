import type * as THREE from 'three'
/** v4: native diffuse comes from occluded baking. Dynamic objects receive the
 * probe field through litMaterial; portable point lights retain their real
 * direction. No ceiling-only cosine or height-based contact-darkening curve. */
export function installL1Lighting(mat:THREE.Material){mat.userData.l1LightingVersion=4}
