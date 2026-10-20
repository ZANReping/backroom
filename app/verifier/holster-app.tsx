// Production App and its real input listeners; all persistence stays in memory.
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import '../src/index.css'
const memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
const q=new URLSearchParams(location.search)
memory.set('br_settings',JSON.stringify({leftHanded:q.has('left'),lightMode:'realistic',textureQuality:2}))
if(q.has('custom'))memory.set('br_touch_layout',JSON.stringify({portrait:{holster:{x:.3,y:.5,scale:1.2},attack:{x:.53,y:.68,scale:1}},landscape:{holster:{x:.3,y:.5,scale:1.2},attack:{x:.53,y:.68,scale:1}}}))
engine.seed=20261006;engine.loadLevel(104,{mapSeed:20261006,firstVisit:false});engine.introT=0;engine.player.x=41.7;engine.player.y=25.5;engine.player.hotbar[0]={type:'crowbar',count:1};engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/']}><App/></MemoryRouter>)
Object.assign(window,{holsterApp:{engine,memory,look,renderer:()=>getRenderer(document.querySelector('canvas')!),ready:true}})
