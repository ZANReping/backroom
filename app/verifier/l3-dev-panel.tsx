import React from 'react'
import { createRoot } from 'react-dom/client'
import HUD from '../src/components/HUD'
import '../src/index.css'

// Mount the production HUD over the isolated, memory-only Level 3 verifier.
export function mount(qa: { engine: React.ComponentProps<typeof HUD>['engine'] }) {
  const element = document.createElement('div')
  document.body.append(element)
  const overlays = [...document.querySelectorAll<HTMLElement>('nav, aside')]
  overlays.forEach(el => { el.hidden = true })
  const root = createRoot(element)
  const noop = () => {}
  root.render(<HUD engine={qa.engine} isMobile={false} log={[]} toasts={[]} devMode fxScale={1}
    onPause={noop} onInventory={noop} onSelectSlot={noop} onUseSlot={noop} />)
  return () => { root.unmount(); element.remove(); overlays.forEach(el => { el.hidden = false }) }
}
