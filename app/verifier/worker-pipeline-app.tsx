import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import '../src/index.css'
const params=new URLSearchParams(location.search),level=Number(params.get('level')??5),mode=params.get('mode')==='classic'?'classic':'realistic',memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:true,lightMode:mode,textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:false}))
engine.seed=424242;engine.loadLevel(level,{mapSeed:424242,firstVisit:false});engine.introT=0;engine.dev.frozenAI=true;engine.dev.god=true;engine.dev.statLock=true;engine.dev.phenOff.add('flicker');engine.handsStowed=true
engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)
Object.assign(window,{workerApp:{engine,memory,mode,look,renderer:()=>getRenderer(document.querySelector('canvas')!),ready:true}})
