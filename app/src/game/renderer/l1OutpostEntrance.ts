import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { factionSignTexture, signStyleFor } from './factionSigns'
const SIGN_TEXT:Record<L1OutpostOrg,string>={alpha:'M.E.G. ALPHA / 前哨入口',tom:"Tom's Diner / 餐馆 · 由此进入",bntg:'商人之家 / B.N.T.G. TRADE POST',ariane:'希波克拉底-1 / ARIANE CLINIC',cornucopia:'丰饶角 / ARGOS CORNUCOPIA'}

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
    [new THREE.BoxGeometry(1.3,.38,.03),new THREE.Vector3(0,2.2,.075),'sign backing'],
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
  // v3: a real faction plate over the shutter (was a plain coloured bar)
  const signMat=litMaterial({ map: factionSignTexture(signStyleFor(org==='cornucopia'?'argos':org), SIGN_TEXT[org], 1.26/.34), roughness: .55 });signMat.name=`L1 outpost entrance / ${org} sign`;signMat.userData.l1Owned=true
  const face=new THREE.Mesh(new THREE.PlaneGeometry(1.26,.34),signMat);face.position.set(0,2.2,.0905);face.name=`${org} organization sign`;root.add(face)
  root.traverse(o => { if (o instanceof THREE.Mesh) o.userData.l1OutpostEntrance = true })
  return root
}
