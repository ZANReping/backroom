import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {ENTITIES} from '../src/game/entities'
import '../src/index.css'
const memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({lightMode:'realistic',textureQuality:2}))
memory.set('br_codex_seen',JSON.stringify(Object.fromEntries(Object.keys(ENTITIES).map(k=>[k,6]))))
engine.seed=20261017;engine.loadLevel(104,{mapSeed:20261017,firstVisit:false});engine.introT=0;engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/']}><App/></MemoryRouter>)
Object.assign(window,{entityCodexApp:{engine,memory,get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
