import { createRoot } from 'react-dom/client'

// Developer-only check: exercise the actual component's image-error fallback.
export async function verifySixIcons() {
  // Match the game's Engine-first bootstrap order for its existing registry cycle.
  await import('../src/game/engine')
  const { ItemGlyph }=await import('../src/components/HUD')
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:1000;background:#18201e;color:#eee;display:flex;gap:40px;align-items:center;justify-content:center'
  document.body.appendChild(host);const root=createRoot(host)
  root.render(<>{['luckymilk','pockets','fuyouyu'].map(type=><div key={type} data-icon={type}><ItemGlyph type={type} size={96}/><p>{type}</p></div>)}</>)
  await new Promise(r=>setTimeout(r,250))
  const loaded=[...host.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth===128)
  host.querySelectorAll('img').forEach(i=>i.dispatchEvent(new Event('error')))
  await new Promise(r=>setTimeout(r,100))
  const svgCount=host.querySelectorAll('svg').length
  const milkPath=host.querySelector('[data-icon="luckymilk"] svg path')?.getAttribute('d')
  const valid=loaded&&svgCount===3&&milkPath?.startsWith('M9 9.5')
  root.unmount();host.remove()
  if(!valid)throw Error('Pixel icon or actual SVG error fallback failed')
  return {loadedPixelIcons:3,svgFallbacks:svgCount,milkBottlePath:true}
}
