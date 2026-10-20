// Production App, isolated in-memory saves. No player's save slot is touched.
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import '../src/index.css'
const memory=new Map<string,string>(),mode=new URLSearchParams(location.search).get('mode')==='classic'?'classic':'realistic'
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:true,lightMode:mode,textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:false}))
engine.seed=7391;engine.loadLevel(0,{mapSeed:7391,firstVisit:false});engine.introT=0;engine.dev.frozenAI=true;engine.dev.god=true;engine.dev.statLock=true
engine.player.hotbar[0]={type:'velvetcake',count:1};engine.player.selected=0;engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)
Object.assign(window,{testfieldApp:{engine,memory,mode,look,renderer:()=>getRenderer(document.querySelector('canvas')!),get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
