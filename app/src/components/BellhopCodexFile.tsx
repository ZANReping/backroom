// [bellhop] Entity 135「The Bellhopper」图鉴专页：恐怖旅馆行李员的员工档案（与管家 / 看门人档案同一套 1920 年代墨绿 + 金线 + 羊皮纸风格，复用 MaidCodexFile.css 的 mcf-* 类）。
// 嵌在 InventoryOverlay.CodexDetail 里，位于「行为 / 应对方法」之后、M.E.G. 档案之前。
// 内容：档案卡（始终）· 见过的面孔 8 格（看清过才点亮；跨局记在登记簿 hotelBook.bhFaces）· 两种铃声（tier ≥ 2）·
//       寄存须知（tier ≥ 3）· 「致行李员」一行（交过情书才解锁，跨局）· 行李记录（读 engine.hotel.bellhop，局内实时）。
import type { Engine } from '@/game/engine'
import { BH } from '@/game/engine/bellhopAI'
import { itemName } from '@/game/content/items'
import './MaidCodexFile.css'

const TAGS = ['孤例', '智能', '人类关联', '浪漫', '实体 18', '恐怖旅馆设定']
/** 与 renderer/bellhopFace FACES 顺序一致 */
export const BELLHOP_FACE_NAMES = ['仓鸮', '雪鸮', '角鸮', '长耳鸮', '草鸮', '乌林鸮', '灰林鸮', '纵纹腹小鸮'] as const
const BELLS: { when: string; say: string }[] = [
  { when: '清脆的两下', say: '满意。东西收下了、送还了、茶很好。' },
  { when: '沉闷的一长声', say: '不满。整栋楼都会听见（酒店关注度 +10），管家和看门人会循声过来。' },
]

function FaceCell({ i, lit }: { i: number; lit: boolean }) {
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')
  return (
    <div style={{ width: 60, textAlign: 'center' }}>
      <div style={{ width: 60, height: 75, border: '1px solid #8a6a32', background: lit ? `url(${base}textures/l5/bellhop_faces.jpg) ${-i * 60}px 0 / 480px 75px` : 'repeating-linear-gradient(45deg,#0d1612 0 6px,#111c17 6px 12px)', boxShadow: lit ? 'inset 0 0 0 2px rgba(226,196,122,.35)' : undefined, filter: lit ? undefined : 'grayscale(1)' }}>
        {!lit && <span style={{ display: 'block', paddingTop: 26, color: '#3a4a3a', fontSize: 18 }}>？</span>}
      </div>
      <div style={{ fontSize: 10, color: lit ? '#cdbb90' : '#4a5248', marginTop: 2 }}>{lit ? BELLHOP_FACE_NAMES[i] : `第 ${i + 1} 张`}</div>
    </div>
  )
}

export default function BellhopCodexFile({ engine, tier, met }: { engine: Engine; tier: number; met: number }) {
  const save = engine.hotel?.bellhop
  const book = engine.hotelBook as unknown as { bhFaces?: number[]; bhLove?: 1 }
  const seen = new Set(book?.bhFaces ?? [])
  return (
    <div className="mcf">
      <div className="mcf-head">
        <div className="mcf-dept">恐怖旅馆 · 礼宾部 · 行李组</div>
        <div className="mcf-title">员工档案 <span>No.135</span></div>
        <div className="mcf-en">THE BELLHOPPER</div>
      </div>
      <div className="mcf-stamp">孤 例</div>
      <p className="mcf-epi">「您的行李，我会替您收好。」（他从没说出口过）</p>

      <div className="mcf-sheet">
        <dl className="mcf-grid">
          <dt>称呼</dt><dd>行李员（The Bellhopper）</dd>
          <dt>工号</dt><dd>135</dd>
          <dt>职务</dt><dd>行李寄存 · 送还 · 在走廊尽头候命</dd>
          <dt>编制</dt><dd>孤例：全楼只有一位</dd>
          <dt>当值</dt><dd>全天；10F 行李层一定在岗</dd>
          <dt>面孔</dt><dd>8 张（每次你再看过去，都换了一张）</dd>
          <dt>语言</dt><dd className="mcf-dim">不说话，只摇铃</dd>
          <dt>标签</dt><dd>{TAGS.map(t => <span key={t} className="mcf-tag">{t}</span>)}</dd>
        </dl>
      </div>

      <section className="mcf-sec">
        <h4>见过的面孔 {seen.size}/8</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BELLHOP_FACE_NAMES.map((_, i) => <FaceCell key={i} i={i} lit={seen.has(i)} />)}
        </div>
        <p className="mcf-note">只有看清了才算数：他脸朝着你、离你不到 {BH.faceSeenR} 米。换脸的那一下，从来没有人看见过。</p>
      </section>

      <section className="mcf-sec">
        <h4>两种铃声</h4>
        {tier >= 2 ? (
          <ul className="mcf-lines">
            {BELLS.map(l => <li key={l.when}><span className="mcf-when">{l.when}</span><span>{l.say}</span></li>)}
          </ul>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 3 - met)} 次】</p>}
      </section>

      <section className="mcf-sec">
        <h4>寄存须知</h4>
        {tier >= 3 ? (
          <>
            <ul className="mcf-lines">
              <li><span className="mcf-when">寄存</span><span>走到他跟前（{BH.serveR} 米内）按 X，把手上的东西交给他，换一张编号的黄铜行李牌。最多替你收 {BH.depositCap} 件。</span></li>
              <li><span className="mcf-when">取回</span><span>出示行李牌。13 楼的同事没收不到寄存的东西。</span></li>
              <li><span className="mcf-when">「清理」档</span><span>关注度到 {BH.refuseAt} 以上，他不再收你的东西，还会把寄存的先一步送去 10F 行李房。</span></li>
              <li><span className="mcf-when">钥匙</span><span>13 楼没收的钥匙由他代管，领回要付一点代价（关注度 +{BH.keyClaimAttn}）。请他喝杯茶就免了。</span></li>
              <li><span className="mcf-when">退房的住客</span><span>在这栋楼里倒下的人，行李会被他搬去 10F 行李房，系好写着名字的牌子。</span></li>
            </ul>
          </>
        ) : <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, 6 - met)} 次】</p>}
      </section>

      {book?.bhLove && (
        <section className="mcf-sec">
          <h4>致行李员</h4>
          <p className="mcf-note" style={{ color: '#e2c47a' }}>你替一位绅士把信送到了。他把它收进制服内袋，从那以后，他替你保管的东西再也不收任何代价。</p>
        </section>
      )}

      <section className="mcf-sec">
        <h4>行李记录</h4>
        {save ? (
          <>
            <div className="mcf-stats">
              <span>寄存 <b>{save.n.deposit}</b></span><span>取回 <b>{save.n.claim}</b></span><span>请茶 <b>{save.n.tea}</b></span>
              <span>被拒 <b>{save.n.refuse}</b></span><span>友好铃 <b>{save.n.friendly}</b></span><span>恼怒铃 <b>{save.n.annoyed}</b></span><span>领回钥匙 <b>{save.n.keys}</b></span>
            </div>
            {save.deposits.length > 0 && <ul className="mcf-cart">{save.deposits.map(d => <li key={d.tag}>No.{d.tag} · {itemName(d.item.type)}{d.item.count > 1 ? ` ×${d.item.count}` : ''}</li>)}</ul>}
            <p className="mcf-note">10F 行李房：{save.room.length ? `还有 ${save.room.length} 件等你去取。` : '空着。'}{save.held.length ? ` 他还替你收着 ${save.held.length} 把钥匙。` : ''}{save.free ? ` 下一次领回免代价（${save.free}）。` : ''}{save.loved ? ' 情书已送达。' : ''}</p>
          </>
        ) : <p className="mcf-dim">还没有和他打过交道。</p>}
      </section>
    </div>
  )
}
