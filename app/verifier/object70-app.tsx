// Mount the production App, including its real input, loading and loot UI.
// Only this browser page's in-memory storage is used; player saves are untouched.
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import '../src/index.css'
const before=new URLSearchParams(location.search).has('before')
const source=before?'/.cache/object70-v83-before/src':'/src'
const {storage}=await import(/* @vite-ignore */`${source}/game/core/storage.ts`)
const {engine}=await import(/* @vite-ignore */`${source}/game/engine.ts`)
const render=await import(/* @vite-ignore */`${source}/game/renderer/index.ts`)
const memory=new Map<string,string>()
storage.get=(k:string)=>memory.get(k)??null;storage.set=(k:string,v:string)=>{memory.set(k,v)};storage.remove=(k:string)=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({lightMode:'realistic',textureQuality:2,dynamicExposure:false}))
engine.seed=20261017;engine.loadLevel(1,{mapSeed:20261017,firstVisit:false});engine.introT=0;engine.persist();engine.paused=true
const {default:App}=await import(/* @vite-ignore */`${source}/App.tsx`)
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/']}><App/></MemoryRouter>)
Object.assign(window,{object70App:{before,source,engine,memory,look:render.look,renderer:()=>render.getRenderer(document.querySelector('canvas')!),get level(){return engine.player.level},get paused(){return engine.paused},ready:true}})
