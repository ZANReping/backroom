// L8 蛛形纲重制——阶段 3：HUD 状态（中毒 / 蛛网缠缚 / 酸雾腐蚀视野 / 螨群瘙痒 / 吸附蜱）。
// 只读 arachnidHudState，没有状态时不渲染任何东西。HUD.tsx 里一行接入（// [L8-arachnid]）。
import type { Engine } from '@/game/engine'
import { arachnidHudState } from '@/game/engine/arachnidAI'

export default function ArachnidHud({ engine }: { engine: Engine }) {
  const s = arachnidHudState(engine)
  if (!s) return null
  const chips: { text: string; color: string }[] = []
  if(s.acid>0)chips.push({text:'酸雾刺激视线',color:'#b9dc4c'})
  if (s.poison > 0) chips.push({ text: `☠ 中毒 ${s.poison.toFixed(1)}/s · ${s.poisonT.toFixed(0)}s`, color: '#9be05a' })
  if (s.web > 0) chips.push({ text: `🕸 被蛛网缠住 ${s.web.toFixed(1)}s（挣扎移动）`, color: '#e8e4da' })
  if (s.mites > 0) chips.push({ text: `✶ 螨虫瘙痒 ${s.mites.toFixed(0)}s（入水冲掉）`, color: '#e0a07a' })
  if (s.tick !== null) chips.push({ text: `● 吸附蜱 ${Math.round(s.tick * 100)}%（交互键拔掉）`, color: '#c98ab8' })
  return (
    <>
      {chips.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-[31] -translate-x-1/2 flex flex-col items-center gap-1">
          {chips.map((c) => <div key={c.text.slice(0, 3)} className="hud-panel font-mono2 px-3 py-1 text-[11px]" style={{ color: c.color }}>{c.text}</div>)}
        </div>
      )}
    </>
  )
}
