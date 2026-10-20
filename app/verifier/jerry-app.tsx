// Actual production App with page-local saves; player storage is never accessed.
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import {jerryState} from '../src/game/engine/jerryAI'
import '../src/index.css'
const mode=new URLSearchParams(location.search).get('mode')==='classic'?'classic':'realistic',memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:true,lightMode:mode,textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:false}))
memory.set('br_codex_seen',JSON.stringify({jerry:1}))
engine.seed=6767;engine.loadLevel(274,{mapSeed:6767,firstVisit:false});engine.introT=0;engine.dev.frozenAI=true;engine.dev.god=true;engine.dev.statLock=true
for(const ent of engine.map!.entities)if(ent.def.type==='jerry')jerryState(ent)
engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)
Object.assign(window,{jerryApp:{engine,memory,mode,look,renderer:()=>getRenderer(document.querySelector('canvas')!),get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
