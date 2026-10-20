// v83：容器「尸体」= Object 70 检查（npm run check:object70）
import * as THREE from 'three'
import { buildObject70, object70Variant, animateObject70Part, buildBentoItemMesh, O70_SUITS } from '../src/game/renderer/object70Mesh'
import { buildAvatarModel } from '../src/game/renderer/retroAvatar'
import { retroTexture } from '../src/game/renderer/retroNpc'
import { object70Keep, object70Sid } from '../src/game/decorations/object70'
import { CONTAINERS, CONTAINER_RARE } from '../src/game/decorations/containers'
import { ITEMS } from '../src/game/content/items'
import { DEFAULT_AVATAR } from '../src/game/core/avatar'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { setMaterialMode } from '../src/game/renderer/shared'
import { generateLevel } from '../src/game/world/mapgen'
import { LEVELS } from '../src/game/levels'
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } }
console.log('Object 70 检查')
// 生成概率减半
let keep = 0; const N = 20000
for (let i = 0; i < N; i++) if (object70Keep(1 + (i % 12), (i * 37) % 997 - 400, Math.floor(i / 7) - 900)) keep++
ok(Math.abs(keep / N - 0.5) < 0.02, `生成概率减半：保留 ${(keep / N * 100).toFixed(1)}%（目标 50%）`)
ok(object70Keep(1, 123, -45) === object70Keep(1, 123, -45), '保留判定确定性（同坐标同结果，与加载顺序无关）')
// 腐化阶段分布
const st = [0, 0, 0], su = new Array(O70_SUITS.length).fill(0)
for (let i = 0; i < N; i++) { const v = object70Variant((i * 2654435761) >>> 0); st[v.stage]++; su[v.suit]++ }
ok(Math.abs(st[0] / N - 0.7) < 0.02 && Math.abs(st[1] / N - 0.2) < 0.02 && Math.abs(st[2] / N - 0.1) < 0.015, `腐化阶段 新鲜/腐败/白骨 = ${st.map((v) => (v / N * 100).toFixed(1) + '%').join(' / ')}（目标 70/20/10）`)
ok(su[0] / N > 0.4 && su.every((v) => v > 0), `西装配色：棕褐最常见 ${(su[0] / N * 100).toFixed(0)}%，五款都会出现`)
// 模型
const seedOf = (want: (v: ReturnType<typeof object70Variant>) => boolean) => { for (let s = 1; s < 1e5; s++) if (want(object70Variant(s))) return s; return 1 }
const tri = (g: THREE.Object3D) => { let t = 0, c = 0; g.traverse((o: any) => { if (o.isMesh) { c++; const gi = o.geometry; t += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } }); return { t: Math.round(t), c } }
for (const stage of [0, 1, 2] as const) {
  const b = buildObject70(seedOf((v) => v.stage === stage))
  const s = tri(b.group)
  ok(s.t < 4500 && s.c <= 28, `${['新鲜', '腐败', '白骨'][stage]}：${s.t} 三角面 · ${s.c} 网格（≤4500 / ≤28）`)
  const box = new THREE.Box3().setFromObject(b.group)
  ok(box.max.y < 0.5 && box.min.y > -0.06, `${['新鲜', '腐败', '白骨'][stage]}：俯卧贴地（高 ${box.max.y.toFixed(2)}m）`)
  ok(box.getSize(new THREE.Vector3()).length() > 1.6, `${['新鲜', '腐败', '白骨'][stage]}：身长尺寸合理（包围盒对角 ${box.getSize(new THREE.Vector3()).length().toFixed(2)}m）`)
  ok(b.parts.caseG && b.parts.lid && b.parts.latches.length === 2 && !!b.parts.goods, `${['新鲜', '腐败', '白骨'][stage]}：公文包（箱盖 + 两枚铜扣 + 内容物）`)
  if (stage !== 2) {
    let closed = false
    b.group.traverse((o: any) => {
      if (!o.isMesh) return
      for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (mt?.name?.includes('/ face')) closed = closed || mt.map === retroTexture('/textures/npc-retro/pool/m0-2/neutral-blink.png')
      }
    })
    ok(closed, `${['新鲜', '腐败'][stage]}：尸体面部使用闭眼贴图`)
  }
}
const living = buildAvatarModel({ ...DEFAULT_AVATAR }, { seed: 212, driven: true })
let livingOpen = false
living.traverse((o: any) => { if (!o.isMesh) return; for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) if (mt?.name?.includes('/ face')) livingOpen = livingOpen || mt.map === retroTexture('/textures/npc-retro/pool/m1-2/neutral.png') })
ok(livingOpen, '活体默认仍使用睁眼贴图')
const a = buildObject70(seedOf((v) => v.stage === 0)), b2 = buildObject70(seedOf((v) => v.stage === 0))
const bodyA = a.group.getObjectByName('object70 body') as THREE.Mesh, bodyB = b2.group.getObjectByName('object70 body') as THREE.Mesh
ok(!!bodyA && bodyA.geometry !== bodyB.geometry && bodyA.geometry.getAttribute('position').count === bodyB.geometry.getAttribute('position').count, '同变体从静态模板构建，实例独立持有几何')
let ring = false, mel = false
a.group.traverse((o: any) => { if (o.isMesh && o.geometry?.type === 'TorusGeometry' && o.geometry.parameters.radius < 0.012) ring = true; if (o.isMesh && o.geometry?.type === 'IcosahedronGeometry' && o.geometry.parameters.radius < 0.012) mel = true })
ok(ring, '右手无名指银戒'); ok(mel, '右颈黑素瘤')
// 动画
const mov = (o: THREE.Object3D, part: string) => { o.userData.part = part; o.userData.bx = o.position.x; o.userData.by = o.position.y; o.userData.bz = o.position.z; o.userData.brx = o.rotation.x; o.userData.bry = o.rotation.y; o.userData.brz = o.rotation.z }
const P = a.parts; mov(P.caseG, 'case'); mov(P.lid, 'lid'); P.latches.forEach((l) => mov(l, 'latch')); mov(P.goods, 'goods')
const pose = (k: number, looted: boolean) => { animateObject70Part(P.caseG, 'case', k, looted); animateObject70Part(P.lid, 'lid', k, looted); P.latches.forEach((l) => animateObject70Part(l, 'latch', k, looted)); animateObject70Part(P.goods, 'goods', k, looted) }
const cx0 = P.caseG.position.x
pose(0.5, false)
ok(Math.abs(P.caseG.position.x - cx0) > 0.1 && Math.abs(P.lid.rotation.z - (P.lid.userData.brz as number)) < 1e-6 && P.latches[0].rotation.z > 1, '搜索进度条走完（k=0.5）：公文包抽出、铜扣弹开、箱盖未开')
pose(1, false)
ok(P.lid.rotation.z > 1.8 && P.goods.scale.x === 1, '搜完（k=1）：箱盖翻开 ~112°，内容物可见')
pose(1, true)
ok(P.goods.scale.x < 0.01 && P.lid.rotation.z > 1.8, '取空（looted）：箱内清空、箱盖保持敞开（读档同态）')
pose(0, false)
ok(Math.abs(P.caseG.position.x - cx0) < 1e-6 && P.goods.scale.x < 0.01, '中断搜索（k 回 0）：公文包放回手边')
// 掉落与物品
const C = CONTAINERS.corpse
ok(C.dur === 1.8 && C.pool.includes('bento') && C.pool.includes('citywater') && C.pool.includes('notebook'), `掉落池：便当 / 水瓶 / 文具（搜索 ${C.dur}s）`)
ok(C.pool.every((t) => !!ITEMS[t]) && (CONTAINER_RARE.corpse ?? []).every((r) => !!ITEMS[r.type]), '掉落池物品均已登记')
ok(ITEMS.bento?.use === 'eat' && ITEMS.bento.value > ITEMS.canned.value && ITEMS.bento.name === '自制便当', `新物品「自制便当」：饥饿 +${ITEMS.bento?.value}（罐头 +${ITEMS.canned.value}）`)
const bm = buildBentoItemMesh(); ok(tri(bm).c <= 6, `便当物品模型 ${tri(bm).c} 网格`)
// Runtime ownership, UVs and both material modes. A retired instance must not
// emit disposal events for a different live instance or a future cached build.
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  const one=buildObject70(83), two=buildObject70(83)
  let finite=true, owned=true, disposed=0
  const geos=new Set<THREE.BufferGeometry>(), mats=new Set<THREE.Material>()
  one.group.traverse((o:any)=>{if(o.isMesh){geos.add(o.geometry);for(const mt of Array.isArray(o.material)?o.material:[o.material])mats.add(mt)}})
  two.group.traverse((o:any)=>{
    if(!o.isMesh)return
    owned=owned&&!geos.has(o.geometry)
    o.geometry.addEventListener('dispose',()=>disposed++)
    for(const k of ['position','normal','uv']){const a=o.geometry.getAttribute(k);finite=finite&&!!a&&Array.from(a.array).every(Number.isFinite)}
    for(const mt of Array.isArray(o.material)?o.material:[o.material]){owned=owned&&!mats.has(mt)&&mt.userData.object70Owned===true;mt.addEventListener('dispose',()=>disposed++)}
  })
  ok(finite,`${mode}：位置、法线与 UV 数值有限，静态烘焙保留展开`)
  ok(owned,`${mode}：实例独立几何／材质，共用图片`)
  disposeCharacterModel(one.group)
  ok(disposed===0,`${mode}：释放一个实例不会释放另一个实例`)
  const three=buildObject70(83)
  ok(tri(three.group).t===tri(two.group).t,`${mode}：回收后可从模板再次构建`)
  disposeCharacterModel(two.group);disposeCharacterModel(three.group)
}
setMaterialMode('classic')
const l1=generateLevel(LEVELS.find(l=>l.id===1)!,20261017,false)
const corpses=l1.structures.filter(s=>s.kind==='corpse')
ok(corpses.length>0&&corpses.every(s=>s.data?.sid!==undefined),'实际 L1 自然生成尸体均具有持久标识')
ok(corpses.every(s=>s.data?.sid===object70Sid(1,s.x+l1.inf!.ox,s.y+l1.inf!.oy,s.floor)),'标识采用世界坐标，不受流式窗口原点影响')
console.log(`\n${pass} 通过，${fail} 失败`)
if (fail) process.exit(1)
