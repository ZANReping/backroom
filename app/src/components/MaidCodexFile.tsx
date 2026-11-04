// [maid] Entity 111「The Housekeeper」图鉴专页：恐怖旅馆客房部的员工档案（与住客登记簿同一套 1920 年代墨绿 + 金线 + 羊皮纸风格）。
// 嵌在 InventoryOverlay.CodexDetail 里，位于「行为 / 应对方法」之后、M.E.G. 档案之前。
// 内容随遭遇次数解锁（tier 1 / 2 / 3，与图鉴一致）：
//   档案卡（始终）· 她说过的话（tier ≥ 2）· 响动分级（tier ≥ 3，只画刻度不写数字）· 失物推车（读 engine.hotel.maid，局内实时）。
import type { Engine } from '@/game/engine'
import { ITEMS } from '@/game/content/items'
import { MD } from '@/game/engine/maidAI'
import { l5Tier } from '@/game/engine/l5Hotel'
import './MaidCodexFile.css'

const TAGS = ['孤例', '智能', '人类关联', '恐怖旅馆设定']
const LINES: { when: string; say: string }[] = [
  { when: '初见安静的住客', say: '您好，酒店服务！' },
  { when: '走廊太吵', say: '现在您能安静一下了吗？您这样对大家都没好处。' },
  { when: '还是太吵', say: '……唉。' },
  { when: '打扫完毕', say: '好了。干净了。' },
  { when: '归还失物', say: '请收好。下次可别再弄丢了。' },
]
const NOISE: { name: string; amt: number }[] = [
  { name: '开枪 · 爆炸', amt: MD.amtGun },
  { name: '破门', amt: MD.amtBreak },
  { name: '重击', amt: MD.amtLoudMelee },
  { name: '近战挥击', amt: MD.amtMelee },
  { name: '冲刺（每一步）', amt: MD.amtSprintStep },
  { name: '走路 · 蹲行', amt: 0 },
]

export default function MaidCodexFile({ engine, tier, met }: { engine: Engine; tier: number; met: number }) {
  const save = engine.hotel?.maid
  const strict = engine.hotel ? l5Tier(engine.hotel.attn) >= 2 : false
  const k = strict ? MD.tierK : 1
  const warn = MD.warnAt * k, act = MD.actAt * k
  const cart = save?.cart ?? []
  const counts = new Map<string, number>()
  for (const it of cart) counts.set(it.type, (counts.get(it.type) ?? 0) + Math.max(1, it.count))
  return (
    <div className="mcf">
      <div className="mcf-head">
        <div className="mcf-dept">恐怖旅馆 · 客房部</div>
        <div className="mcf-title">员工档案 <span>No.111</span></div>
        <div className="mcf-en">THE HOUSEKEEPER</div>
      </div>
      <div className="mcf-stamp">孤 例</div>
      <p className="mcf-epi">「她完成了工作。」</p>

      <div className="mcf-sheet">
        <dl className="mcf-grid">
          <dt>称呼</dt><dd>管家（The Housekeeper）</dd>
          <dt>工号</dt><dd>111</dd>
          <dt>职务</dt><dd>客房清洁 · 走廊</dd>
          <dt>编制</dt><dd>孤例：每层同一时间只有一位</dd>
          <dt>当值</dt><dd>全天；推车巡楼，慢而不停</dd>
          <dt>宿舍</dt><dd className="mcf-dim">（未登记）</dd>
          <dt>标签</dt><dd>{TAGS.map(t => <span key={t} className="mcf-tag">{t}</span>)}</dd>
        </dl>
      </div>

      <section className="mcf-sec">
        <h4>她说过的话</h4>
        {tier >= 2 ? (
          <ul className="mcf-lines">
            {LINES.map(l => <li key={l.say}><span className="mcf-when">{l.when}</span><q>{l.say}</q></li>)}
          </ul>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 3 - met)} 次】</p>}
      </section>

      <section className="mcf-sec">
        <h4>她听得见什么</h4>
        {tier >= 3 ? (
          <>
            <div className="mcf-meter">
              {NOISE.map(n => (
                <div key={n.name} className="mcf-row">
                  <span className="mcf-src">{n.name}</span>
                  <span className="mcf-bar">
                    <i style={{ width: `${Math.min(100, n.amt)}%` }} className={n.amt >= act ? 'hot' : n.amt >= warn ? 'warm' : ''} />
                    <b className="mcf-mark" style={{ left: `${warn}%` }} />
                    <b className="mcf-mark act" style={{ left: `${act}%` }} />
                  </span>
                </div>
              ))}
              <div className="mcf-row mcf-legend">
                <span className="mcf-src" />
                <span className="mcf-bar plain">
                  <em style={{ left: `${warn}%` }}>嘘</em>
                  <em className="act" style={{ left: `${act}%` }}>打扫</em>
                </span>
              </div>
            </div>
            <p className="mcf-note">响动会叠加，离得越近越响，隔着墙也听得见；安静一秒后，她的耐心会慢慢回来。{strict ? '酒店正在留意你，她今天格外没耐心。' : ''}</p>
          </>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 6 - met)} 次】</p>}
      </section>

      <section className="mcf-sec">
        <h4>失物推车</h4>
        {save ? (
          <>
            <div className="mcf-stats">
              <span>被警告 <b>{save.warn}</b></span><span>被打扫 <b>{save.clean}</b></span><span>领回 <b>{save.reclaim}</b> 件</span>
            </div>
            {counts.size ? (
              <ul className="mcf-cart">
                {[...counts].map(([type, n]) => <li key={type}>{ITEMS[type]?.name ?? type}{n > 1 ? ` ×${n}` : ''}</li>)}
              </ul>
            ) : <p className="mcf-dim">箱子里没有你的东西。</p>}
            <p className="mcf-note">被收走的东西都在她推车顶上的失物招领箱里。等她安静下来，走到她跟前按 X，她会按先来后到一件件还你——每要回一件，酒店都会多看你一眼。</p>
          </>
        ) : <p className="mcf-dim">还没有和她打过交道。</p>}
      </section>
    </div>
  )
}
