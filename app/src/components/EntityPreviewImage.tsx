import { useEffect, useRef, useState } from 'react'
import { entityArchiveView } from '@/game/entities/archiveViews'
import type { EntityPortraitResult } from './entityPortrait'

export default function EntityPreviewImage({ type, name }: { type: string; name: string }) {
  const host = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const view = entityArchiveView(type, step)
  const [image, setImage] = useState<{ type: string; step: number; value: EntityPortraitResult } | null>(null)
  useEffect(() => {
    let live = true, started = false, cancel: (() => void) | undefined
    const start = () => {
      if (started || !live) return
      started = true
      void import('./entityPortrait').then(({ requestEntityPortrait }) => {
        if (live) cancel = requestEntityPortrait(type, value => { if (live) setImage({ type, step, value }) }, step)
      }).catch(() => { if (live) setImage({ type, step, value: { src: '', status: 'error' } }) })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) start()
    }, { rootMargin: '80px' })
    if (observer && host.current) observer.observe(host.current); else start()
    return () => { live = false; observer?.disconnect(); cancel?.() }
  }, [type, step])
  const value = image?.type === type && image.step === step ? image.value : null
  const unavailable = value?.status === 'unavailable'
  return <figure ref={host} className="entity-archive-preview" data-entity-preview={type} data-state={value?.status ?? 'loading'} data-view={view.index} data-angle={view.angle} data-appearance={view.specimen} data-form={view.form?.id ?? ''}>
    <button type="button" className="entity-archive-image" disabled={!value || unavailable} aria-label={`切换${name}预览角度和外观`} title="点击切换角度；看完四个角度后更换变种或个体外貌" onClick={() => setStep((step + 1) % view.count)}>
      {value?.status === 'ready' ? <img src={value.src} width={448} height={448} alt={`${name}模型预览`} decoding="async" />
        : <div className="entity-archive-placeholder" role="status">{value?.status === 'unavailable' ? '无可视形体' : value?.status === 'error' ? '暂时无法生成预览' : '正在生成影像…'}</div>}
    </button>
    <figcaption className="font-mono2">{name}{!unavailable && <> · {view.label}<span className="entity-archive-hint">点击切换角度 / 外观</span></>}</figcaption>
  </figure>
}
