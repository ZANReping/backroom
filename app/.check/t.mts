import { readFileSync } from 'fs'
import { extractLayouts } from '../src/game/design/extractLayouts.ts'
const d = JSON.parse(readFileSync('.check/player-design.json', 'utf-8'))
const a = extractLayouts().find((l) => l.id === 'alpha')!
const pa = d.layouts.find((l: any) => l.id === 'alpha')
const k = (l: any) => `${l.x},${l.y},${l.r},${l.color}`
const cm = new Map<string, number>()
for (const l of a.lights ?? []) cm.set(k(l), (cm.get(k(l)) ?? 0) + 1)
for (const l of pa.lights ?? []) { const kk = k(l); cm.set(kk, (cm.get(kk) ?? 0) - 1) }
for (const [kk, n] of cm) if (n !== 0) console.log('多余:', kk, '×', n)
