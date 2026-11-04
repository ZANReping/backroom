import { useEffect, useState } from 'react'
import { getMaterialMode } from '@/game/renderer/shared'

const WIDTH = 116, HEIGHT = 148
const photos = new Map<string, string>()
// Framing for the first 448² studio portrait in the entity archive.
const FRAME: Record<string, { cx: number; top: number; height: number }> = {
  beast: { cx: 212, top: 46, height: 132 },
  greeter: { cx: 221, top: 40, height: 140 },
  maid: { cx: 214, top: 66, height: 78 },
  bellhop: { cx: 180, top: 70, height: 100 },
  concierge: { cx: 186, top: 96, height: 92 },
  chef: { cx: 222, top: 62, height: 128 },
  jazz: { cx: 228, top: 66, height: 120 },
}

function cropPhoto(img: HTMLImageElement, type: string) {
  const frame = FRAME[type]
  if (!frame) return ''
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH; canvas.height = HEIGHT
  const g = canvas.getContext('2d')
  if (!g) return ''
  const scale = img.naturalWidth / 448
  const h = frame.height * scale, w = h * WIDTH / HEIGHT
  const background = g.createRadialGradient(WIDTH / 2, HEIGHT * .45, 4, WIDTH / 2, HEIGHT * .45, WIDTH * .8)
  background.addColorStop(0, '#e6d3a2'); background.addColorStop(1, '#a88a50')
  g.fillStyle = background; g.fillRect(0, 0, WIDTH, HEIGHT)
  g.imageSmoothingQuality = 'high'
  g.filter = 'sepia(0.55) contrast(1.08) brightness(0.96)'
  g.drawImage(img, frame.cx * scale - w / 2, frame.top * scale, w, h, 0, 0, WIDTH, HEIGHT)
  g.filter = 'none'
  const vignette = g.createRadialGradient(WIDTH / 2, HEIGHT / 2, WIDTH * .35, WIDTH / 2, HEIGHT / 2, WIDTH * .85)
  vignette.addColorStop(0, 'rgba(40,24,8,0)'); vignette.addColorStop(1, 'rgba(40,24,8,.45)')
  g.fillStyle = vignette; g.fillRect(0, 0, WIDTH, HEIGHT)
  return g.canvas.toDataURL('image/jpeg', .86)
}

function StaffPhoto({ type, photoKey, size }: { type: string; photoKey: string; size: number }) {
  // An empty result means the silhouette remains visible after a failed request.
  const [src, setSrc] = useState(() => photos.get(photoKey))
  useEffect(() => {
    let live = true, cancel: (() => void) | undefined
    const failed = () => { if (live) setSrc('') }
    void import('./entityPortrait').then(({ requestEntityPortrait }) => {
      if (!live) return
      const hit = photos.get(photoKey)
      if (hit) { setSrc(hit); return }
      cancel = requestEntityPortrait(type, result => {
        if (!live) return
        if (result.status !== 'ready') { failed(); return }
        const img = new Image()
        img.src = result.src
        void img.decode().then(() => {
          if (!live) return
          const photo = photos.get(photoKey) ?? cropPhoto(img, type)
          if (photo) photos.set(photoKey, photo)
          setSrc(photo)
        }).catch(failed)
      })
    }).catch(failed)
    return () => { live = false; cancel?.() }
  }, [type, photoKey])

  return (
    <div className="hl-avatar" aria-hidden="true" data-staff-avatar={type}
      data-state={src ? 'ready' : src === undefined ? 'loading' : 'unavailable'} style={{ width: size, height: Math.round(size * HEIGHT / WIDTH) }}>
      {src && <img src={src} alt="" width={WIDTH} height={HEIGHT} draggable={false} />}
    </div>
  )
}

export default function StaffAvatar({ type, met, size = 58 }: { type: string; met: boolean; size?: number }) {
  if (!met) return <div className="hl-avatar" aria-hidden="true" data-staff-avatar={type} data-state="locked" style={{ width: size, height: Math.round(size * HEIGHT / WIDTH) }} />
  const photoKey = `${type}:${getMaterialMode()}`
  return <StaffPhoto key={photoKey} type={type} photoKey={photoKey} size={size} />
}
