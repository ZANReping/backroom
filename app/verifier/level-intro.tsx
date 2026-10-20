import { createRoot } from 'react-dom/client'
import LevelIntro from '/src/components/LevelIntro.tsx'
import Cutscene from '/src/components/Cutscene.tsx'
import { ALL_LEVEL_DEFS, levelNo, levelDefOf, levelLabel } from '/src/game/levels'
import '/src/index.css'

const root = createRoot(document.querySelector('#root')!)
const qa = { epoch: 0, ready: false, done: 0, kind: 'intro', levelId: 7, levels: ALL_LEVEL_DEFS.map(d => ({ id: d.id, name: d.name })), phases: [] as string[], render, reset, setReady, unmount: () => root.render(null) }
function reset(kind = 'intro', ready = false, levelId = kind === 'intro' ? 7 : 1) { qa.epoch++; qa.done = 0; qa.phases = []; qa.ready = ready; qa.kind = kind; qa.levelId = levelId; render() }
function setReady(value: boolean) { qa.ready = value; render() }
function render() {
  const props = { key: qa.epoch, ready: qa.ready, onDone: () => { qa.done++; root.render(null) } }
  const def = levelDefOf(qa.levelId)
  root.render(qa.kind === 'intro'
    ? <LevelIntro {...props} level={levelNo(qa.levelId)} levelId={qa.levelId} name={def?.name ?? '未知层级'} flavor={def?.flavor ?? ''} seed={424242} onPhaseChange={phase => qa.phases.push(phase)} />
    : <Cutscene {...props} levelId={qa.levelId} kind="noclip" cutIn="step" toName={def?.label ?? `${levelLabel(qa.levelId)} · ${def?.name ?? '未知层级'}`} caption="你从现实里剪了出去" onStageChange={stage => qa.phases.push(stage)} />)
}
Object.assign(window, { introQA: qa })
reset()
