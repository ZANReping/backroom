import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { storage } from '../src/game/core/storage'
import { engine } from '../src/game/engine'
import { getRenderer, look } from '../src/game/renderer'
import '../src/index.css'
const mode = new URLSearchParams(location.search).get('mode') === 'classic' ? 'classic' : 'realistic'
// Browser/profile are owned by this check; real storage intentionally survives page reload.
storage.set('br_settings', JSON.stringify({ ...JSON.parse(storage.get('br_settings') ?? '{}'), devMode: true, lightMode: mode, enableFoyer: true, newGameSeed: '424243', textureQuality: 2, muted: true, dynamicExposure: false, dynamicRes: false, renderResolution: 'native', renderScale: 100, maxPixelRatio: 1, grain: false, shake: false }))
const { default: App } = await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App /></MemoryRouter>)
Object.assign(window, { packApp: { engine, look, renderer: () => getRenderer(document.querySelector('canvas')!), get level() { return engine.player.level }, get paused() { return engine.paused }, ready: true } })
