// 爆酸者重制 阶段 3：游戏内渲染接入。
// - animateBursterEntity：把 bursterAI 的阶段映射成 bursterAnim 的动画参数（带平滑过渡），覆盖通用的上下颠簸和死亡动画
// - syncBursterProps：世界坐标下的酸液滴与地面酸液
// - 失明：屏幕模糊 + 黄绿色糊状遮罩；休克时四周压暗
import * as THREE from 'three'
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { buildBursterMesh } from './bursterMesh'
import { animateBurster, setBursterCocoonCrack, BURSTER_REST, type BursterAnim } from './bursterAnim'
import { BURSTER, bursterFrame, bursterVision } from '../engine/bursterAI'

export function buildBursterEntity(seed: number): THREE.Group { const g = buildBursterMesh(seed); g.userData.entType = 'burster'; return g }

const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const approach = (cur: number, want: number, rate: number, dt: number) => cur + (want - cur) * Math.min(1, rate * dt)

export function animateBursterEntity(grp: THREE.Group, e: Entity, time: number, dt: number, gz: number) {
  const s = e.bu
  const sm = (grp.userData.buSm ??= { curl: 1, arch: 0, move: 0, jaw: 0, roll: 0, pitch: 0, t: 0 }) as { curl: number; arch: number; move: number; jaw: number; roll: number; pitch: number; t: number }
  const ph = s?.phase ?? 'sleep', t = s?.t ?? 0
  const a: BursterAnim = { ...BURSTER_REST, t: 0, regrow: s?.blisters ?? 1 }
  let curl = 0, arch = 0, move = 0, jaw = 0, roll = 0, pitch = 0
  switch (ph) {
    case 'sleep': curl = 1; a.breathe = 1; break
    case 'wake': case 'hatch': { const k = t / BURSTER.wakeT; curl = 1 - sst(0.1, 0.75, k); pitch = sst(0.5, 0.9, k) * 0.35; jaw = sst(0.6, 0.9, k) * 0.3; a.breathe = 1 - k * 0.7; break }
    case 'burst': { const k = t / BURSTER.burstT; arch = sst(0, 0.35, k) * (1 - 0.4 * sst(0.8, 1, k)); a.burst = k; jaw = sst(0.3, 0.55, k) * 0.9; pitch = 0.3 * sst(0.2, 0.5, k); break }
    case 'wait': roll = Math.sin(time * Math.PI * 2 / 3) * 0.35; a.headYaw = Math.sin(time * Math.PI * 2 / 3 + 1) * 0.2; pitch = 0.15; break
    case 'stalk': move = Math.min(2, (s?.speed ?? 0) / BURSTER.crawl > 1.3 ? 1 + sst(1, 1.9, (s?.speed ?? 0) / BURSTER.crawl) : (s?.speed ?? 0) / BURSTER.crawl); pitch = 0.1; break
    case 'cocoon': { const k = t / BURSTER.cocoonT; curl = 1; a.cocoon = sst(0.25, 1, k); jaw = 0.6 * (1 - sst(0, 0.4, k)); a.breathe = 0.2; break }
    case 'shell': case 'broken': curl = 1; a.cocoon = 1; a.breathe = 0; break
  }
  // 爆裂动画需要原样时间轴；其余参数平滑过渡
  const fast = ph === 'burst' || ph === 'cocoon'
  sm.curl = fast ? (ph === 'cocoon' ? approach(sm.curl, curl, 3, dt) : approach(sm.curl, curl, 8, dt)) : approach(sm.curl, curl, ph === 'wake' || ph === 'hatch' ? 30 : 3, dt)
  sm.arch = approach(sm.arch, arch, ph === 'burst' ? 30 : 4, dt)
  sm.move = approach(sm.move, move, 5, dt)
  sm.jaw = approach(sm.jaw, jaw, 10, dt)
  sm.roll = approach(sm.roll, roll, 3, dt)
  sm.pitch = approach(sm.pitch, pitch, 4, dt)
  // 步态相位按实际移动量推进，脚不打滑
  sm.t += dt
  a.t = sm.t; a.curl = sm.curl; a.arch = sm.arch; a.move = sm.move; a.jaw = sm.jaw; a.headRoll = sm.roll; a.headPitch = sm.pitch
  if (e.stunT > 0) { a.jaw = 0.7; a.headRoll = Math.sin(time * 30) * 0.15 }
  animateBurster(grp, a)
  if (ph === 'shell' || ph === 'cocoon' || ph === 'broken') setBursterCocoonCrack(grp, s?.crack ?? 0)
  grp.position.y = gz
  grp.rotation.z = 0
  grp.scale.setScalar(1)
  if (ph === 'broken') { // 破茧：碎壳慢慢塌下去
    const k = 1 - Math.max(0, e.deathT) / 4
    grp.position.y = gz - k * 0.25
    grp.scale.set(1 + k * 0.15, Math.max(0.05, 1 - k * 0.7), 1 + k * 0.15)
  }
}

// ---------------- 酸液滴、地面酸液 ----------------
interface Props { map:Engine['map']; globs: THREE.InstancedMesh; pools: THREE.InstancedMesh; blind:THREE.Mesh }
const propsOf = new WeakMap<THREE.Scene, Props>()
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0)
export function syncBursterProps(scene: THREE.Scene, camera:THREE.Camera, engine: Engine) {
  const f = bursterFrame(engine)
  let P = propsOf.get(scene)
  if(P&&P.map!==engine.map){clearBursterProps(scene);P=undefined}
  if (!P) {
    if (!f.globs.length && !f.puddles.length && bursterVision(engine).blind <= 0) return
    const globs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#c9dc48' }), 96)
    const pools = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#a8b83a', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 24)
    globs.frustumCulled = pools.frustumCulled = false
    const blind=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{strength:{value:0},shock:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float strength;uniform float shock;void main(){float edge=smoothstep(.05,.7,length(vUv-.5));gl_FragColor=vec4(mix(vec3(.42,.4,.06),vec3(.015,.012,.006),shock),strength*(.1+.58*edge)+shock*.18);}',transparent:true,depthWrite:false,depthTest:false}))
    blind.frustumCulled=false;blind.renderOrder=10000;blind.position.z=-.15;camera.add(blind)
    scene.add(globs, pools); P = { map:engine.map, globs, pools,blind }; propsOf.set(scene, P)
  }
  let n = 0
  for (const g of f.globs) {
    if (n >= 96) break
    _p.set(g.x, g.z, g.y); _d.set(g.vx, g.vz, g.vy).normalize(); _q.setFromUnitVectors(_x, _d)
    _s.set(0.05, 0.028, 0.028)
    P.globs.setMatrixAt(n++, _m.compose(_p, _q, _s))
  }
  P.globs.count = n; P.globs.instanceMatrix.needsUpdate = true
  n = 0
  for (const q of f.puddles) {
    if (n >= 24) break
    const k = Math.min(1, q.t / 0.3) * (1 - sst(BURSTER.puddleLife - 2, BURSTER.puddleLife, q.t))
    const r = BURSTER.puddleR * (0.5 + 0.5 * k) * (0.8 + ((n * 37) % 10) / 25)
    _p.set(q.x, q.z + 0.012, q.y); _q.identity(); _s.set(r, 1, r * 0.8)
    P.pools.setMatrixAt(n++, _m.compose(_p, _q, _s))
  }
  P.pools.count = n; P.pools.instanceMatrix.needsUpdate = true
  const v=bursterVision(engine),mat=P.blind.material as THREE.ShaderMaterial
  P.blind.visible=!engine.over&&(v.blind>.001||v.shock);mat.uniforms.strength.value=v.blind;mat.uniforms.shock.value=v.shock?1:0
}

/** Scene-owned effects; no DOM overlay, shared globals or stale instances after a level switch. */
export function clearBursterProps(scene:THREE.Scene){const p=propsOf.get(scene);if(!p)return;for(const o of [p.globs,p.pools,p.blind]){o.removeFromParent();o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if((o as THREE.InstancedMesh).isInstancedMesh)(o as THREE.InstancedMesh).dispose()}propsOf.delete(scene)}
