import { useEffect, useRef } from 'react'
import ToyShareActions from './ToyShareActions'

export default function ToyHomeShare({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={dialog} aria-labelledby="toy-home-share-title" onCancel={onClose}
    className="hud-panel w-[min(440px,90vw)] p-5 text-center backdrop:bg-black/80"
    style={{ color: 'var(--text)', background: 'var(--panel)', maxHeight: 'calc(var(--toy-height, 100dvh) - var(--toy-safe-top, 0px) - var(--toy-safe-bottom, 0px) - 32px)', overflowY: 'auto' }}>
    <h2 id="toy-home-share-title" className="text-lg">邀请朋友探索后室</h2>
    <p className="my-3 text-sm">分享游戏首页，或扫码在另一台设备打开。此链接不携带存档；联机请在房主大厅分享房间邀请。</p>
    <ToyShareActions path="index.html" />
    <button className="mt-4 border px-4 py-2" onClick={onClose}>返回首页</button>
  </dialog>
}
