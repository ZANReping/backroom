import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'

export type L1OutpostOrg = 'alpha' | 'tom' | 'bntg' | 'ariane' | 'cornucopia'

const ORG: Record<L1OutpostOrg, { frame: number; sign: number }> = {
  alpha: { frame: 0x686f6a, sign: 0xc5a74c }, tom: { frame: 0x76504a, sign: 0xb94839 },
  bntg: { frame: 0x3e5548, sign: 0x83b89a }, ariane: { frame: 0x645d86, sign: 0x9b8ce0 }, cornucopia: { frame: 0x826c3b, sign: 0xd2b36d },
}

function material(color: number, name: string, roughness = .72) { const m = litMaterial({ color, roughness }); m.name = `L1 outpost entrance / ${name}`; m.userData.l1Owned=true; return m }
function merged(parts: Array<[THREE.BufferGeometry, THREE.Vector3, string]>, mat: THREE.Material, name: string) {
  const gs = parts.map(([g, p]) => g.translate(p.x, p.y, p.z))
  const geo = mergeGeometries(gs, false) ?? gs[0]
  for (const g of gs) if (g !== geo) g.dispose()
  const o = new THREE.Mesh(geo, mat); o.name = name; o.castShadow = true; o.receiveShadow = true; return o
}

/** Compact wall-mounted L1 outpost shutter. Local +Z faces the room; wall is z=-.5. */
export function buildL1OutpostEntrance(org: L1OutpostOrg = 'alpha'): THREE.Group {
  const c = ORG[org] ?? ORG.alpha, root = new THREE.Group(); root.name = `L1 outpost entrance:${org}`
  const frameMat = material(c.frame, 'frame')
  const frame = merged([
    [new THREE.BoxGeometry(.09, 2.5, .14), new THREE.Vector3(-.925, 1.25, 0), 'left'],
    [new THREE.BoxGeometry(.09, 2.5, .14), new THREE.Vector3(.925, 1.25, 0), 'right'],
    [new THREE.BoxGeometry(1.94, .12, .14), new THREE.Vector3(0, 2.44, 0), 'lintel'],
  ], frameMat, 'roller shutter frame'); root.add(frame)
  const shutterParts: Array<[THREE.BufferGeometry, THREE.Vector3, string]> = []
  const slatMat = material(0x858a88, 'shutter slats', .58)
  const step=2.32/14
  for (let i = 0; i < 14; i++) {
    shutterParts.push([new THREE.BoxGeometry(1.76, step+.002, .028), new THREE.Vector3(0, step/2+.002+i*step, .018), `slat ${i}`])
  }
  shutterParts.push([new THREE.BoxGeometry(.16, .2, .06), new THREE.Vector3(0, .105, .045), 'bottom lock'])
  root.add(merged(shutterParts.slice(0, 14), slatMat, 'thin metal shutter'))
  const folds=[shutterParts[14]]
  for(let i=1;i<14;i++)folds.push([new THREE.BoxGeometry(1.76,.005,.003),new THREE.Vector3(0,.002+i*step,.034),'fold seam'])
  root.add(merged(folds, material(0x333938, 'lock and fold seams', .42), 'lock and fold seams'))
  root.add(merged([[new THREE.BoxGeometry(.5, .14, .025), new THREE.Vector3(0, 2.22, .09), 'sign']], material(c.sign, `${org} organization sign`, .5), `${org} organization sign`))
  root.traverse(o => { if (o instanceof THREE.Mesh) o.userData.l1OutpostEntrance = true })
  return root
}
