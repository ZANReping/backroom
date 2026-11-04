// [concierge] Entity 131「The Concierge」图鉴专页：恐怖旅馆前台的员工档案（与管家档案 / 住客登记簿同一套 1920 年代墨绿 + 金线 + 羊皮纸风格，复用 MaidCodexFile.css 的 mcf-* 类）。
// 嵌在 InventoryOverlay.CodexDetail 里，位于「行为 / 应对方法」之后、M.E.G. 档案之前。
// 内容随遭遇次数解锁（tier 1 / 2 / 3，与图鉴一致）：
//   档案卡（始终）· 他说过的话（tier ≥ 2）· 「方向」与眼睛（tier ≥ 3）· 前台记录（读 engine.hotel.concierge，局内实时）。
import type { Engine } from '@/game/engine'
import { CC } from '@/game/engine/conciergeAI'
import { ConciergeEyeSvg } from './ConciergeHud'
import './MaidCodexFile.css'

const TAGS = ['孤例', '智能', '人类关联', '多眼', '恐怖旅馆设定']
const LINES: { when: string; say: string }[] = [
  { when: '朝出口走的住客', say: '你需要帮助吗？我可以把宴会的方向指给你……' },
  { when: '跟他走', say: '这边请。宴会在这边。' },
  { when: '到了宴会厅', say: '祝您用餐愉快。请不要再走错方向了。' },
  { when: '被拒绝', say: '……这样不好。' },
  { when: '捆好之后', say: '请不要乱动。我会送您去该去的地方。' },
  { when: '收到 437 号钥匙', say: '啊……437。谢谢您，十三楼的同事总是忘了还。' },
]
const EXITS: { name: string; guard: boolean }[] = [
  { name: '年久失修的古典楼梯（→ Level 4）', guard: true },
  { name: '锅炉房深处完全黑暗的门（→ Level 6）', guard: true },
  { name: '客房深处的深色木门（→ Level 9）', guard: true },
  { name: '电梯（酒店自己的）', guard: false },
  { name: '宴会厅 · 餐厅 · 客房', guard: false },
]

export default function ConciergeCodexFile({ engine, tier, met }: { engine: Engine; tier: number; met: number }) {
  const save = engine.hotel?.concierge
  return (
    <div className="mcf">
      <div className="mcf-head">
        <div className="mcf-dept">恐怖旅馆 · 前厅部</div>
        <div className="mcf-title">员工档案 <span>No.131</span></div>
        <div className="mcf-en">THE CONCIERGE</div>
      </div>
      <div className="mcf-stamp">孤 例</div>
      <p className="mcf-epi">「每位住客都应当走在正确的方向上。」</p>

      <div className="mcf-sheet">
        <dl className="mcf-grid">
          <dt>称呼</dt><dd>看门人（The Concierge）</dd>
          <dt>工号</dt><dd>131</dd>
          <dt>职务</dt><dd>大堂前台 · 钥匙 · 电话 · 指路</dd>
          <dt>编制</dt><dd>孤例：全楼只有一位</dd>
          <dt>当值</dt><dd>全天；茶歇约 {CC.teaLen} 秒，换班时回岗</dd>
          <dt>眼睛</dt><dd>脸上 4 只 · 左前臂 4 只 · 右前臂 5 只</dd>
          <dt>宿舍</dt><dd className="mcf-dim">送菜升降梯通往的那一层（未登记）</dd>
          <dt>标签</dt><dd>{TAGS.map(t => <span key={t} className="mcf-tag">{t}</span>)}</dd>
        </dl>
      </div>

      <section className="mcf-sec">
        <h4>他说过的话</h4>
        {tier >= 2 ? (
          <ul className="mcf-lines">
            {LINES.map(l => <li key={l.say}><span className="mcf-when">{l.when}</span><q>{l.say}</q></li>)}
          </ul>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 3 - met)} 次】</p>}
      </section>

      <section className="mcf-sec">
        <h4>「方向」与眼睛</h4>
        {tier >= 3 ? (
          <>
            <ul className="mcf-lines">
              {EXITS.map(x => <li key={x.name}><span className="mcf-when">{x.guard ? '会拦' : '不管'}</span><span style={{ color: x.guard ? '#e2c47a' : undefined }}>{x.name}</span></li>)}
            </ul>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 2px' }}>
              <ConciergeEyeSvg size={72} />
              <p className="mcf-note" style={{ margin: 0 }}>他前臂上的一只眼一直挂在你身上。被他盯上的时候，你的余光里会偶尔闪过一只这样的眼睛。你看着他，他就只能站着、抬起前臂看你；你一移开视线，他就近了一步。</p>
            </div>
            <p className="mcf-note">不管的人：躲在客房里蹲着发抖的、在床上睡着的、在正确方向上徘徊的。他饿，金属（尤其银餐具）能让他停下来啃上一阵。</p>
          </>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 6 - met)} 次】</p>}
      </section>

      <section className="mcf-sec">
        <h4>前台记录</h4>
        {save ? (
          <>
            <div className="mcf-stats">
              <span>被搭话 <b>{save.talks}</b></span><span>跟他走 <b>{save.follows}</b></span><span>被追 <b>{save.chases}</b></span>
              <span>被捆 <b>{save.binds}</b></span><span>挣脱 <b>{save.escapes}</b></span><span>13 楼 <b>{save.lifts}</b></span><span>啃金属 <b>{save.gnaws}</b></span>
            </div>
            <p className="mcf-note">437 号房钥匙：{save.key437 ? '已交还。钥匙墙上那一格终于不空了。' : '钥匙墙上那一格还空着。'}</p>
          </>
        ) : <p className="mcf-dim">还没有和他打过交道。</p>}
      </section>
    </div>
  )
}
