import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getToyQr, localToyLink, subscribeToy, toyErrorMessage, toySnapshot, toyTimeout } from '@/game/platform/toy'

// A new target gets isolated request state, so an old room cannot replace its QR/link.
export default function ToyShareActions(props: { path: string; image?: string }) {
  return <ShareTarget key={props.path} {...props} />
}
function ShareTarget({ path, image }: { path: string; image?: string }) {
  const { supported } = useSyncExternalStore(subscribeToy, toySnapshot)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState<ToySDK.QrCodeResp | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    if (supported.getQrCode) void getToyQr(path).then(result => { if (active) setQr(result) }, () => { /* Retry from the QR button. */ })
    return () => { active = false }
  }, [path, supported.getQrCode])
  const run = (fn: () => Promise<unknown>, success: string) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    // Start calls inside the click gesture, before awaiting any other operation.
    const finish = () => { locked.current = false; if (alive.current) setBusy(false) }
    try { void toyTimeout(fn()).then(() => { if (alive.current) setMessage(success) }, error => { if (alive.current) setMessage(toyErrorMessage(error)) }).finally(finish) }
    catch (error) { finish(); setMessage(toyErrorMessage(error)) }
  }
  const link = qr?.url ?? localToyLink(path)
  return <div className="mt-3 space-y-2 text-xs" onClick={e => e.stopPropagation()}>
    <div className="flex flex-wrap justify-center gap-2">
      {supported.share && <button disabled={busy} className="border px-3 py-2" onClick={() => run(() => window.toy!.share({ path }), '已调用分享面板。')}>分享到 B站</button>}
      {supported.getQrCode && <button disabled={busy} className="border px-3 py-2" onClick={() => run(async () => {
        const result = await getToyQr(path)
        if (alive.current) { setQr(result); setShowQr(true) }
      }, '扫码可打开此页面。')}>显示二维码</button>}
      <button disabled={busy} className="border px-3 py-2" onClick={() => run(() => navigator.clipboard?.writeText(link) ?? Promise.reject(new DOMException('Clipboard unavailable', 'NotAllowedError')), '链接已复制。')}>复制链接</button>
      {image && <>
        {supported.saveImageToAlbum && <button disabled={busy} className="border px-3 py-2" onClick={() => run(() => window.toy!.saveImageToAlbum({ base64Data: image, hintMsg: '保存你的后室生存报告' }), '生存报告已保存。')}>保存到相册</button>}
        <a className="border px-3 py-2" href={image} download="后室生存报告.png">下载报告图片</a>
      </>}
    </div>
    {message && <p role="status">{message}</p>}
    {showQr && qr && <div className="space-y-2 text-center">
      <img className="mx-auto" src={qr.base64} alt="打开后室 Toy 的二维码" width={180} height={180} />
      <div className="flex flex-wrap justify-center gap-2">
        {supported.saveImageToAlbum && <button disabled={busy} className="border px-3 py-2" onClick={() => run(() => window.toy!.saveImageToAlbum({ base64Data: qr.base64, hintMsg: '保存后室邀请二维码' }), '二维码已保存。')}>保存二维码到相册</button>}
        <a className="border px-3 py-2" href={qr.base64} download="后室邀请二维码.png">下载二维码</a>
      </div>
    </div>}
    <details><summary className="cursor-pointer">查看链接</summary><p className="my-1">{qr ? '平台生成的分享链接' : '当前页面链接（平台链接暂未生成）'}</p><input aria-label="分享链接" readOnly value={link} onFocus={e => e.currentTarget.select()} className="mt-2 w-full bg-black/20 p-2" /></details>
  </div>
}
