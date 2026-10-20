// Production UI components, isolated finite map and in-memory persistence. No player saves.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { storage } from '../src/game/core/storage'
import { engine } from '../src/game/engine'
import { listSaveSlots } from '../src/game/engine/save'
import type { GameMap } from '../src/game/world/mapgen'
import TitleScreen from '../src/components/TitleScreen'
import SettingsModal, { createDefaultSettings } from '../src/components/SettingsModal'
import HUD from '../src/components/HUD'
import PauseMenu from '../src/components/PauseMenu'
import InventoryOverlay from '../src/components/InventoryOverlay'
import AvatarEditor from '../src/components/AvatarEditor'
import DialogOverlay from '../src/components/DialogOverlay'
import LootPanel from '../src/components/LootPanel'
import DeathScreen from '../src/components/DeathScreen'
import VictoryScreen from '../src/components/VictoryScreen'
import LoadingScreen from '../src/components/LoadingScreen'
import '../src/index.css'

const memory = new Map<string, string>()
storage.get = key => memory.get(key) ?? null
storage.set = (key, value) => { memory.set(key, value) }
storage.remove = key => { memory.delete(key) }
const zero = () => new Uint8Array(1024)
engine.map = { w:32,h:32,tiles:new Uint8Array(1024).fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
  wet:zero(),elev:zero(),outdoor:zero(),step:zero(),crawl:zero(),ceiling:zero(),up:zero(),upWall:zero(),up2:zero(),upWall2:zero(),stair:new Int32Array(1024),
  liquid:zero(),seaFloor:new Float32Array(1024),floors:1,dn:zero(),dnWall:zero(),tint:zero() } satisfies GameMap
engine.explored = new Uint8Array(1024).fill(1)
engine.visible = new Uint8Array(1024).fill(1)
Object.assign(engine.player, { level:4,x:16,y:16,hp:100,sanity:20,hunger:64,thirst:80,tapes:3,aliveTime:827,steps:2643 })
engine.seed=20261006
engine.player.hotbar=[{type:'flashlight',count:1},{type:'almond',count:3},{type:'glowstick',count:2},null,null,null,null]
engine.player.backpack[0]={type:'wrench',count:1}
type Screen='title'|'settings'|'hud'|'pause'|'inventory'|'dialog'|'loot'|'death'|'victory'|'loading'|'avatar'
const events:string[]=[]
let navigate:(screen:Screen)=>void=()=>{}
const ui = { show:(screen:Screen)=>navigate(screen),engine,events,memory,settings:createDefaultSettings(),ready:false }
;(window as any).__ui=ui

function Fixture(){
  const [screen,setScreen]=useState<Screen>('title')
  const [settings,setSettings]=useState(createDefaultSettings())
  const [,refresh]=useState(0)
  useEffect(()=>engine.on(()=>refresh(n=>n+1)),[])
  navigate=next=>{if(next==='loot')engine.lootPanel={sid:812,label:'办公柜抽屉',items:['almond','glowstick','battery','bandage']};setScreen(next)}
  ui.settings=settings;ui.ready=true
  const action=(id:string)=>()=>{events.push(id)}
  const close=()=>{events.push('close');setScreen('hud')}
  const mobile=matchMedia('(pointer: coarse)').matches
  return <>
    <div style={{position:'fixed',inset:0,background:'linear-gradient(130deg,#413e2c,#272819 65%,#716343)'}}/>
    {screen==='title'&&<TitleScreen slots={listSaveSlots()} onNewGame={action('new')} onContinueSlot={action('continue')} onDeleteSlot={action('delete')} onSettings={()=>setScreen('settings')} onHowTo={action('help')} onCodex={()=>setScreen('inventory')} onAvatar={()=>setScreen('avatar')}/>}
    {screen==='avatar'&&<AvatarEditor onClose={close}/>}
    {screen==='settings'&&<SettingsModal settings={settings} onChange={s=>{events.push('setting');setSettings(s);document.documentElement.dataset.theme=s.theme}} onClose={close}/>}
    {screen==='hud'&&<HUD engine={engine} isMobile={mobile} log={[]} toasts={[]} devMode={new URLSearchParams(location.search).has('dev')} fxScale={0} onPause={()=>setScreen('pause')} onInventory={()=>setScreen('inventory')} onSelectSlot={i=>{engine.player.selected=i;refresh(n=>n+1)}} onUseSlot={action('use')}/>}
    {screen==='pause'&&<PauseMenu onResume={close} onSettings={()=>setScreen('settings')} onHowTo={action('help')} onRadio={action('radio')} showRadio onUnstuck={action('unstuck')} onQuit={()=>setScreen('title')}/>}
    {screen==='inventory'&&<InventoryOverlay engine={engine} onClose={close}/>}
    {screen==='dialog'&&<DialogOverlay npcId="kat" onClose={close}/>}
    {screen==='loot'&&<LootPanel engine={engine} onClose={()=>{engine.closeLootPanel();close()}}/>}
    {screen==='death'&&<DeathScreen engine={engine} cause="长时间脱水，未能离开这一层。" onRetry={action('retry')} onTitle={()=>setScreen('title')}/>}
    {screen==='victory'&&<VictoryScreen engine={engine} onNG={action('ng')} onTitle={()=>setScreen('title')}/>}
    {screen==='loading'&&<LoadingScreen progress={67} label="准备 Level 0 建筑" detail="材质与模型上传" history={['载入存档','准备物品贴图','准备模型','准备建筑']}/>}
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
