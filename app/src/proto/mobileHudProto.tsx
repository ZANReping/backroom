/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拨动引擎字段 */
// 移动端 HUD + 触屏按钮布局预览（真实 HUD / TouchControls / CareerTracker，最小引擎状态，无 3D 画面）。
// ?task=meg|bntg|0（右上角任务追踪）&left=1（左手模式）&hands=1（手持武器）
import '@/index.css'
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { engine } from '@/game/engine'
import HUD from '@/components/HUD'
import TouchControls from '@/components/TouchControls'
import CareerTracker from '@/components/CareerTracker'
import { megState } from '@/game/engine/megMissions'
import { MEG_MISSIONS } from '@/game/content/megMissions'
import { FACTION_MISSIONS } from '@/game/content/factionMissions'
import { factionState } from '@/game/engine/factionMissions'
import { loadTouchLayout } from '@/components/LayoutEditor'

const q = new URLSearchParams(location.search)
const eng: any = engine
const S = 20
eng.map = { w: S, h: S, tiles: new Uint8Array(S * S).fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 10, y: 10 } }
Object.assign(eng.player, { x: 10.5, y: 11.5, z: 0, level: 0, floor: 0, hp: 82 })
eng.msg = () => {}; eng.persist = () => {}
for (const t of ['almond', 'almond', 'canned', 'battery', 'flashlight', 'knife', 'bandage']) eng.addItem(t)
try { localStorage.setItem('hud.factionTrackerCollapsed', q.get('fold') === '1' ? '1' : '0') } catch { /* */ }
const task = q.get('task') ?? 'meg'
if (task !== '0') {
  const faction = FACTION_MISSIONS.find(m => m.faction === task)
  const m = faction ?? MEG_MISSIONS[0]
  const st = faction ? factionState(eng, faction.faction) : megState(eng)
  st.missions[m.id] = { stage: 0, progress: 0, completed: false, points: [], observed: [], journal: [] }
  st.tracked = { kind: 'line', id: m.id }
}
if (q.get('main') === '1') { eng.player.prologue = { step: 'done', flags: { landing: true, main_quest: true, l0_phone: true } }; eng.player.tapes = 1 }
;(window as any).__eng = eng
const settings: any = { stickSize: 132, btnOpacity: 70, leftHanded: q.get('left') === '1', sensitivity: 1, devMode: false }
function App() {
  const [, refresh] = useState(0)
  useEffect(() => { const resize = () => refresh(n => n + 1); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  return <>
    <CareerTracker />
    <HUD engine={engine} isMobile log={[]} toasts={[]} devMode={false} fxScale={0} onPause={() => {}} onInventory={() => {}} onPhone={() => {}} onSelectSlot={() => {}} onUseSlot={() => {}} />
    <TouchControls engine={engine} settings={settings} layout={(loadTouchLayout() as any)[innerWidth > innerHeight ? 'landscape' : 'portrait'] ?? {}} onInventory={() => {}} onPause={() => {}} />
  </>
}
document.body.style.background = 'linear-gradient(#5d5a3c,#2b291c)'
try { createRoot(document.getElementById('ui')!).render(<App />) } catch (e) { (window as any).__err = String(e) }
addEventListener('error', (e) => { (window as any).__err = String(e.message) })
document.fonts.ready.then(() => setTimeout(() => { if (q.get('open') === '1') (document.querySelector('[data-quest-chip]') as HTMLElement | null)?.click(); setTimeout(() => { (window as any).__ready = true }, 300) }, 1200))
