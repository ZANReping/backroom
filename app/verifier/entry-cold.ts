import {Engine} from '../src/game/engine'
import {getRenderer,look} from '../src/game/renderer'
import {storage} from '../src/game/core/storage'
import {audio} from '../src/game/core/audio'
import {attach} from './entry-speed.js'
storage.get=()=>null;storage.set=()=>{};storage.remove=()=>{}
audio.setMuted(true)
const canvas=document.querySelector('canvas')!,engine=new Engine(),renderer=getRenderer(canvas)
renderer.resize(innerWidth,innerHeight,1)
renderer.setSceneLightLimit(8);renderer.setChunkBudget(2);renderer.setLoadingBudget(4);renderer.setShadows(false);renderer.setBloomFx(false);renderer.setLightMode('classic');renderer.setTextureQuality(0);renderer.setDetailDistance(.65);renderer.setParticleDensity(.25);renderer.three.info.autoReset=false
const qa={engine,renderer,look},mode=new URLSearchParams(location.search).get('mode')==='classic'?'classic':'realistic'
const environment=attach(qa,mode)
Object.assign(window,{perfQA:qa,entryEnvironment:environment})
