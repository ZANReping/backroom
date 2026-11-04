// 原型预览页：L5 电梯面板（?mode=main|service&floor=5&entry=38）
import { createRoot } from 'react-dom/client'
import { engine } from '@/game/engine'
import { openElevator, elevatorKey } from '@/game/engine/l5Elevator'
import ElevatorPanel from '@/components/ElevatorPanel'
import '@/index.css'
const q = new URLSearchParams(location.search)
const mode = (q.get('mode') ?? 'main') as 'main' | 'service'
engine.hotel.floor = Number(q.get('floor') ?? 5)
engine.emit = () => {}
openElevator(engine, mode, mode === 'main' ? { kind: 'elevatorshaft', name: '电梯', dest: 3, anim: 'shutter' } as never : undefined)
for (const k of (q.get('entry') ?? '')) elevatorKey(engine, k)
createRoot(document.getElementById('root')!).render(<ElevatorPanel onClose={() => {}} />)
setTimeout(() => { (window as any).__ready = true }, 600)
