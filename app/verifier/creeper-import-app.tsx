import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import '../src/index.css'
const params=new URLSearchParams(location.search),mode=params.get('mode')==='classic'?'classic':'realistic',stage=params.get('stage')==='before'?'before':'after',memory=new Map<string,string>()
Object.assign(window,{creeperImportBoot:{phase:'map',at:performance.now()}})
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:true,lightMode:mode,textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:false}))
const seed=Number(params.get('seed')??424242)
engine.seed=seed;engine.loadLevel(2,{mapSeed:seed,firstVisit:false});engine.introT=0;engine.dev.frozenAI=true;engine.dev.god=true;engine.dev.statLock=true;engine.dev.phenOff.add('flicker');engine.handsStowed=true
engine.persist();engine.paused=true
Object.assign(window,{creeperImportBoot:{phase:'importing-app',at:performance.now()}})
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)
Object.assign(window,{creeperImportApp:{engine,memory,mode,stage,look,renderer:()=>getRenderer(document.querySelector('canvas')!),get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
