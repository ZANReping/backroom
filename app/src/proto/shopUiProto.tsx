/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拨动引擎字段 */
// 商店 / 对话界面预览：真实 ShopOverlay / DialogOverlay + 最小引擎状态（商人就站在玩家面前）。
// ?npc=<id>&mode=shop|dialog&tab=buy|sell&sel=N&rep=N&buy=<item>&sell=1
import '@/index.css'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { engine } from '@/game/engine'
import { NPCS } from '@/game/content/npcs'
import { TRADERS_MARKET_PEOPLE } from '@/game/content/tradersMarket'
import { TRADERS_SHOP_PEOPLE } from '@/game/content/tradersShops'
import { L11_PEOPLE } from '@/game/content/l11People'
import ShopOverlay from '@/components/shop/ShopOverlay'
import DialogOverlay from '@/components/DialogOverlay'

const q = new URLSearchParams(location.search)
const id = q.get('npc') ?? 'mkt_moore'
const def0: any = NPCS[id] ?? (TRADERS_MARKET_PEOPLE as any)[id] ?? (TRADERS_SHOP_PEOPLE as any)[id] ?? L11_PEOPLE.find((d) => d.id === id)
const def: any = q.get('fac') ? { ...def0, faction: q.get('fac') } : def0 // fac= 只在预览里换皮肤（首都共同体目前没有商人）
const eng: any = engine
const S = 20
eng.map = { w: S, h: S, tiles: new Uint8Array(S * S).fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 10, y: 10 } }
Object.assign(eng.player, { x: 10.5, y: 11.5, z: 0, level: 102, floor: 0, hp: 100 })
eng.msg = () => {}; eng.persist = () => {}
eng.npcs = [{ id, def, x: 10.5, y: 10.5, floor: 0, facing: 0, dead: false, hostile: false }]
if (q.has('rep')) eng.rep[def.faction ?? 'meg'] = Number(q.get('rep'))
const give = (t: string, n: number) => { for (let i = 0; i < n; i++) eng.addItem(t) }
give('presses', 46); give('eaglecoin', 30); give('almond', 5); give('canned', 3); give('battery', 4); give('knife', 1); give('outdoorkit', 1); give('flashlight', 1); give('bandage', 2); give('wheatgrain', 3); give('stonekazoo', 1); give('rope', 1)
if (q.has('sell')) { /* 演示：卖一次 */ }
// 仓库演示：?wh=1 预置仓库库存（rep 默认 20 以解锁）；click=<文字> 挂载后点击含该文字的按钮
if (q.has('wh')) {
  eng.rep[def.warehouse ?? 'meg'] = Number(q.get('rep') ?? 20)
  const wf = def.warehouse ?? 'meg'
  const put = [['canned', 4], ['almond', 9], ['battery', 6], ['bandage', 5], ['crowbar', 1], ['flashlight', 1], ['rope', 2], ['outdoorkit', 1], ['wheatgrain', 7], ['coffee', 3], ['lighter', 1], ['knife', 1]] as const
  put.forEach(([t, c], i) => { eng.warehouses[wf][i * 2 + (i % 3)] = { type: t, count: c } })
  eng.map = null // 预览里没有真实地图：团体履历面板的 3D 视线判定直接跳过
}
;(window as any).__eng = eng
function App() {
  const [mode, setMode] = useState(q.get('mode') ?? 'shop')
  return mode === 'shop'
    ? <ShopOverlay npcId={id} onClose={() => {}} onTalk={() => setMode('dialog')} />
    : <DialogOverlay npcId={id} onClose={() => {}} onShop={() => setMode('shop')} />
}
document.body.style.background = 'radial-gradient(ellipse at 50% 30%,#4a4636,#14130d 70%)'
createRoot(document.getElementById('ui')!).render(<App />)
// 预选页签 / 行（模拟按键）
setTimeout(() => {
  const ck = q.get('click')
  if (ck) [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(ck))?.click()
  const ck2 = q.get('click2') // 第二次点击：CSS 选择器（如仓库格 .wh-store .wh-cell:nth-child(5)）
  if (ck2) setTimeout(() => (document.querySelector(ck2) as HTMLElement | null)?.click(), 200)
  if (q.get('tab') === 'sell') dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }))
  for (let i = 0; i < Number(q.get('sel') ?? 0); i++) dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }))
  document.fonts.ready.then(() => setTimeout(() => { (window as any).__ready = true }, q.get('mode') === 'dialog' ? 2600 : 600))
}, 300)
