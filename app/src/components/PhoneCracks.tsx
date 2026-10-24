// 前厅 M4：手机碎屏贴图（坠入 Level 0 后）。SVG 程序化裂纹，覆盖在手机界面之上，不拦截点击。
// 撞击点在右下角：主裂纹放射 + 环形碎裂 + 玻璃反光碎片；固定种子，每次打开同一张裂纹。
import type { JSX } from 'react'

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const W = 300, H = 560
const paths: { d: string; w: number; o: number }[] = []
const shards: string[] = []
{
  const r = rng(0x5eed42)
  const ix = W * 0.72, iy = H * 0.78
  const rays = 13
  const ends: { x: number; y: number }[][] = []
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (r() - 0.5) * 0.35
    let x = ix, y = iy, d = `M${ix.toFixed(1)} ${iy.toFixed(1)}`
    const pts: { x: number; y: number }[] = [{ x, y }]
    const len = 120 + r() * 420
    const seg = 7 + Math.floor(r() * 6)
    let ang = a
    for (let k = 0; k < seg; k++) {
      ang += (r() - 0.5) * 0.5
      const st = len / seg * (0.6 + r() * 0.8)
      x += Math.cos(ang) * st; y += Math.sin(ang) * st
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
      pts.push({ x, y })
      // 分叉
      if (r() < 0.28) {
        let bx = x, by = y, ba = ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6), bd = `M${bx.toFixed(1)} ${by.toFixed(1)}`
        for (let q = 0; q < 3; q++) { ba += (r() - 0.5) * 0.6; bx += Math.cos(ba) * (14 + r() * 26); by += Math.sin(ba) * (14 + r() * 26); bd += ` L${bx.toFixed(1)} ${by.toFixed(1)}` }
        paths.push({ d: bd, w: 0.7, o: 0.55 })
      }
    }
    ends.push(pts)
    paths.push({ d, w: 1.2 + r() * 0.6, o: 0.85 })
  }
  // 撞击点附近的环形碎裂（连接相邻主裂纹的第 1、2、3 个节点）
  for (const ring of [1, 2, 3]) {
    let d = ''
    for (let i = 0; i < rays; i++) {
      const a = ends[i][Math.min(ring, ends[i].length - 1)], b = ends[(i + 1) % rays][Math.min(ring, ends[(i + 1) % rays].length - 1)]
      if (r() < 0.75) d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${((a.x + b.x) / 2 + (r() - 0.5) * 10).toFixed(1)} ${((a.y + b.y) / 2 + (r() - 0.5) * 10).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)} `
      if (ring === 1 && r() < 0.6) shards.push(`M${ix} ${iy} L${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`)
    }
    paths.push({ d, w: ring === 1 ? 1.1 : 0.8, o: 0.7 })
  }
}

export default function PhoneCracks(): JSX.Element {
  return (
    <svg data-phone-cracked viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {shards.map((d, i) => <path key={`s${i}`} d={d} fill={i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.22)'} />)}
      {paths.map((p, i) => <path key={`d${i}`} d={p.d} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={p.w + 1.2} strokeLinecap="round" strokeLinejoin="round" opacity={p.o * 0.6} />)}
      {paths.map((p, i) => <path key={`l${i}`} d={p.d} fill="none" stroke="rgba(235,242,250,0.9)" strokeWidth={p.w * 0.6} strokeLinecap="round" strokeLinejoin="round" opacity={p.o} />)}
      <circle cx={W * 0.72} cy={H * 0.78} r={9} fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.7)" strokeWidth={0.8} />
    </svg>
  )
}
