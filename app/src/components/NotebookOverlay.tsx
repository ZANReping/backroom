// 笔记本（物品「笔记本和笔」打开的书写界面）：
// 真实笔记本风格——横线纸 + 左侧红边线 + 手写体；内容自动本地持久化（br_notebook）。
import { useEffect, useState } from 'react'
import { storage } from '@/game/storage'
import { audio } from '@/game/audio'

const KEY = 'br_notebook'
const HAND_FONT = "'Segoe Script','Comic Sans MS','Ma Shan Zheng',cursive"

export default function NotebookOverlay({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(() => {
    try { return storage.get(KEY) ?? '' } catch { return '' }
  })
  useEffect(() => {
    try { storage.set(KEY, text) } catch { /* 存储失败不打扰书写 */ }
  }, [text])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="anim-slideUp relative w-full max-w-[560px] rounded-sm"
        style={{
          background: '#f2e9d0',
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(90,120,180,0.35) 28px)',
          border: '1px solid #c9b48a',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7), inset 0 0 60px rgba(160,130,80,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 装订孔 */}
        <div className="absolute inset-y-4 left-3 flex flex-col justify-between">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="block h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }} />
          ))}
        </div>
        {/* 红边线 */}
        <div className="absolute inset-y-0 left-10 w-px" style={{ background: 'rgba(200,80,80,0.55)' }} />
        <div className="flex items-center justify-between px-12 pt-3">
          <span style={{ color: '#8a6a3a', fontFamily: HAND_FONT, fontSize: 15 }}>笔记本</span>
          <button
            className="font-mono2 px-3 py-0.5 text-[12px]"
            style={{ color: '#8a6a3a', border: '1px solid #c9b48a', background: 'rgba(255,250,235,0.6)' }}
            onClick={() => { audio.uiTick(); onClose() }}
          >
            合上
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="提笔写点什么……"
          autoFocus
          spellCheck={false}
          className="h-[46dvh] w-full resize-none bg-transparent px-12 py-2 outline-none"
          style={{
            color: '#2a3550',
            fontFamily: HAND_FONT,
            fontSize: 17,
            lineHeight: '28px',
            caretColor: '#8a3a3a',
          }}
        />
        <div className="px-12 pb-2 text-right text-[11px]" style={{ color: '#a08a5a', fontFamily: HAND_FONT }}>
          字迹会自动保留
        </div>
      </div>
    </div>
  )
}
