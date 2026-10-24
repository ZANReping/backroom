import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import '../src/index.css'
const params=new URLSearchParams(location.search),mode=params.get('mode')==='classic'?'classic':'realistic',memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:true,lightMode:mode,newGameSeed:'424243',textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:false}))
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)
Object.assign(window,{packApp:{engine,memory,mode,look,renderer:()=>getRenderer(document.querySelector('canvas')!),get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
