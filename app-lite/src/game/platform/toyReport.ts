import type { Engine } from '../engine'
import { levelLabel, WIN_TAPES } from '../levels'

export interface SurvivalReport {
  v: 1; outcome: 'dead' | 'escaped'; level: string; seconds: number
  kills: number; tapes: number; steps: number; seed: number; cause: string
}
const count = (n: number, max = 99999999) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)))
export function makeReport(engine: Engine, outcome: SurvivalReport['outcome'], cause = ''): SurvivalReport {
  const p = engine.player
  return { v: 1, outcome, level: `${levelLabel(p.level)} · ${engine.levelDef.name}`.slice(0, 80), seconds: count(p.aliveTime), kills: count(p.kills), tapes: count(p.tapes, WIN_TAPES), steps: count(p.steps), seed: engine.seed >>> 0, cause: cause.slice(0, 100) }
}
export function reportPath(report: SurvivalReport) {
  return `index.html?report=${encodeURIComponent(JSON.stringify(report))}`
}
export function readReport(search: string): SurvivalReport | null {
  try {
    const raw = new URLSearchParams(search).get('report')
    if (!raw || raw.length > 1000) return null
    const r = JSON.parse(raw) as SurvivalReport
    if (r.v !== 1 || !['dead', 'escaped'].includes(r.outcome) || typeof r.level !== 'string' || r.level.length > 80 || typeof r.cause !== 'string' || r.cause.length > 100) return null
    for (const k of ['seconds', 'kills', 'tapes', 'steps', 'seed'] as const) {
      if (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > (k === 'seed' ? 0xffffffff : k === 'tapes' ? WIN_TAPES : 99999999)) return null
    }
    return { v: 1, outcome: r.outcome, level: r.level, cause: r.cause, seconds: r.seconds, kills: r.kills, tapes: r.tapes, steps: r.steps, seed: r.seed }
  } catch { return null }
}
export function reportRows(r: SurvivalReport): [string, string][] {
  return [['到达位置', r.level], ['存活时间', `${Math.floor(r.seconds / 60)} 分 ${r.seconds % 60} 秒`], ['收集磁带', `${r.tapes} / ${WIN_TAPES}`], ['击杀 / 步数', `${r.kills} / ${r.steps}`], ['世界种子', String(r.seed)], ['结局', r.outcome === 'escaped' ? '逃出生天' : r.cause || '未能生还']]
}
// Draw text/local primitives instead of capturing the WebGL canvas or remote artwork.
export async function drawReport(r: SurvivalReport, qr?: string): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 960
  const c = canvas.getContext('2d')!
  c.fillStyle = '#15140e'; c.fillRect(0, 0, 720, 960)
  c.strokeStyle = '#45412c'; c.lineWidth = 1
  for (let x = 0; x < 720; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 960); c.stroke() }
  c.fillStyle = '#222013'; c.fillRect(32, 32, 656, 896)
  c.fillStyle = '#c6b46a'; c.font = '18px sans-serif'; c.fillText('BACKROOMS : DESCENT / SURVIVAL FILE', 58, 80)
  c.font = 'bold 44px sans-serif'; c.fillText('后室生存报告', 58, 147)
  c.fillStyle = r.outcome === 'escaped' ? '#a6bc87' : '#d29883'; c.font = '24px sans-serif'
  c.fillText(r.outcome === 'escaped' ? '你找到了出口' : '又一位流浪者失联', 58, 196)
  const fitText = (value: string, width: number) => { let s = value; while (s.length && c.measureText(s).width > width) s = s.slice(0, -1); return s === value ? s : s.slice(0, -1) + '…' }
  reportRows(r).forEach(([label, value], i) => {
    const y = 255 + i * 72
    c.font = '16px sans-serif'; c.fillStyle = '#aaa38b'; c.fillText(label, 58, y)
    c.font = '22px sans-serif'; c.fillStyle = '#eee5c8'; c.fillText(fitText(value, 590), 58, y + 30)
  })
  if (qr?.startsWith('data:image/png;base64,') && qr.length < 2_000_000) {
    const img = new Image(); img.src = qr; await img.decode()
    c.fillStyle = '#fff'; c.fillRect(474, 710, 190, 190); c.drawImage(img, 484, 720, 170, 170)
  }
  c.fillStyle = '#c6b46a'; c.font = '22px sans-serif'; c.fillText('你能走得更远吗？', 58, 766)
  c.fillStyle = '#aaa38b'; c.font = '17px sans-serif'; c.fillText('在哔哩哔哩 Toy 探索后室', 58, 805)
  c.font = '14px sans-serif'; c.fillText('玩家分享记录 · 非官方认证成绩', 58, 872)
  const result = canvas.toDataURL('image/png')
  if (result.length > 2_000_000) throw new Error('报告图片过大，请重试')
  return result
}
