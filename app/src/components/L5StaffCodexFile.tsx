// [staff-codex] 恐怖旅馆其余四位员工的图鉴专页：野兽 E18 / 迎宾女郎 E28 / 厨师 E800 / 爵士脑 E197。
// 与管家 / 看门人 / 行李员档案同一套 1920 年代墨绿 + 金线 + 羊皮纸风格（复用 MaidCodexFile.css 的 mcf-* 类）。
// 嵌在 InventoryOverlay.CodexDetail 里，位于「行为 / 应对方法」之后、M.E.G. 档案之前。
// 内容随遭遇次数解锁（tier 1 / 2 / 3，与图鉴一致）：档案卡（始终）· 说过的话（tier ≥ 2）· 机制页（tier ≥ 3）· 记录（读 engine.hotel.*，局内实时）。
import type { ReactNode } from 'react'
import type { Engine } from '@/game/engine'
import { BE, BOON_TEXT, TASK_TEXT, HARSH_TEXT } from '@/game/engine/beastAI'
import { PITCH, INNER } from '@/game/engine/spokesAI'
import { CRAVE, CRAVE_TRUE } from '@/game/engine/chefAI'
import { JAZZ_SONGS, JAZZ_NAME, JAZZ_WHO_LIST, TALK, PRIVATE } from '@/game/engine/jazzAI'
import StaffAvatar from './StaffAvatar'
import './MaidCodexFile.css'

type P = { engine: Engine; tier: number; met: number }
const Locked = ({ need, met }: { need: number; met: number }) => <p className="mcf-locked">【未解锁：再遭遇 {Math.max(1, need - met)} 次】</p>
const Tags = ({ t }: { t: string[] }) => <>{t.map(x => <span key={x} className="mcf-tag">{x}</span>)}</>
function Shell({ dept, no, en, stamp, epi, type, grid, children }: { dept: string; no: string; en: string; stamp: string; epi: string; type: string; grid: ReactNode; children: ReactNode }) {
  return (
    <div className="mcf mcf-staff-file" data-staff-file={type}>
      <div className="mcf-head">
        <div className="mcf-dept">{dept}</div>
        <div className="mcf-title">员工档案 <span>No.{no}</span></div>
        <div className="mcf-en">{en}</div>
      </div>
      <div className="mcf-stamp">{stamp}</div>
      <p className="mcf-epi">「{epi}」</p>
      <div className="mcf-sheet mcf-staff-sheet">
        <StaffAvatar type={type} met size={64} />
        <dl className="mcf-grid">{grid}</dl>
      </div>
      {children}
    </div>
  )
}
const Lines = ({ rows }: { rows: { when: string; say: string }[] }) => (
  <ul className="mcf-lines">{rows.map(l => <li key={l.when + l.say}><span className="mcf-when">{l.when}</span><q>{l.say}</q></li>)}</ul>
)
const Facts = ({ rows }: { rows: { k: string; v: ReactNode; hot?: boolean }[] }) => (
  <ul className="mcf-lines">{rows.map(r => <li key={r.k}><span className="mcf-when">{r.k}</span><span style={{ color: r.hot ? '#e2c47a' : undefined }}>{r.v}</span></li>)}</ul>
)

// ———————————————————————————— 野兽 E18 ————————————————————————————
export function BeastCodexFile({ engine, tier, met }: P) {
  const s = engine.hotel?.beast
  return (
    <Shell dept="恐怖旅馆 · 经理室" no="18" en="THE BEAST OF LEVEL 5" stamp="店 主" type="beast" epi="请坐。喝杯茶，我们谈谈生意。"
      grid={<>
        <dt>称呼</dt><dd>第五层的野兽 · 「先生」</dd>
        <dt>工号</dt><dd>18（无编制，名册首页）</dd>
        <dt>职务</dt><dd>酒店的主人 · 契约</dd>
        <dt>编制</dt><dd>孤例</dd>
        <dt>办公室</dt><dd className="mcf-dim">灯光同时闪烁的那扇木门后（不固定）</dd>
        <dt>常见于</dt><dd>余光 · 画像 · 爵士演出的后排</dd>
        <dt>标签</dt><dd><Tags t={['孤例', '智能', '契约', '章鱼头', '恐怖旅馆设定']} /></dd>
      </>}>
      <section className="mcf-sec">
        <h4>三份契约</h4>
        {tier >= 2 ? (<>
          <Facts rows={(Object.keys(BOON_TEXT) as (keyof typeof BOON_TEXT)[]).map(k => ({ k: BOON_TEXT[k].title, v: BOON_TEXT[k].text }))} />
          <p className="mcf-note">代价总是一件限时的小事：</p>
          <ul className="mcf-cart">{(Object.keys(TASK_TEXT) as (keyof typeof TASK_TEXT)[]).map(k => <li key={k}>{TASK_TEXT[k](Math.round(BE.task[k].limit / 60))}</li>)}</ul>
          <p className="mcf-note">握手即签。婉拒会扣 {BE.declineSanity} 点理智，并增加 {BE.declineAttn} 点关注。怀疑他会锁住出口，直到惩罚结算。</p>
        </>) : <Locked need={3} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>违约与余光</h4>
        {tier >= 3 ? (<>
          <Facts rows={[
            { k: '第一次违约', v: '熄灯，从背后被抓住，拖回办公室，签一份没得挑的契约。', hot: true },
            ...(Object.keys(HARSH_TEXT) as (keyof typeof HARSH_TEXT)[]).map(k => ({ k: '　' + HARSH_TEXT[k].title, v: HARSH_TEXT[k].text })),
            { k: '第二次', v: '没有契约了。', hot: true },
            { k: '余光里', v: '酒店盯上你、或你开始害怕时，他站在视野边缘。别转头——他会退进暗处。' },
          ]} />
          <p className="mcf-note">画像里的脸有时候是他的。他还写过一封情书，给走廊尽头那位摇铃的。</p>
        </>) : <Locked need={6} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>契约记录</h4>
        {s ? (<>
          <div className="mcf-stats">
            <span>来访 <b>{s.n.visit}</b></span><span>签约 <b>{s.n.deal}</b></span><span>履行 <b>{s.contracts.filter(c => c.state === 'done').length}</b></span>
            <span>违约 <b>{s.contracts.filter(c => c.state === 'breach').length}</b></span><span>婉拒 <b>{s.n.decline}</b></span><span>余光里 <b>{s.n.seen}</b></span><span>冒犯 <b>{s.strikes}</b></span>
          </div>
          {s.contracts.some(c => c.state === 'active') && <ul className="mcf-cart">{s.contracts.filter(c => c.state === 'active').map(c => <li key={c.id}>No.{c.id} · {BOON_TEXT[c.boon].title} · 剩 {Math.ceil(c.left / 60)} 分</li>)}</ul>}
          {s.sanCut > 0 && <p className="mcf-note">他拿走了一小块你：理智上限 −{s.sanCut}。</p>}
        </>) : <p className="mcf-dim">还没有和他谈过生意。</p>}
      </section>
    </Shell>
  )
}

// ———————————————————————————— 迎宾女郎 E28 ————————————————————————————
export function GreeterCodexFile({ engine, tier, met }: P) {
  const s = engine.hotel?.spokes
  return (
    <Shell dept="恐怖旅馆 · 前厅部" no="28" en="THE SPOKESWOMAN" stamp="微 笑" type="greeter" epi="恐怖旅馆～有着最好员工的旅馆！"
      grid={<>
        <dt>称呼</dt><dd>迎宾女郎（The Spokeswoman）</dd>
        <dt>工号</dt><dd>28</dd>
        <dt>职务</dt><dd>大堂接待 · 海报 · 「参观」邀请</dd>
        <dt>编制</dt><dd>孤例</dd>
        <dt>发声</dt><dd>领口小音箱；嘴从来不动</dd>
        <dt>办公室</dt><dd className="mcf-dim">大堂北墙后面</dd>
        <dt>标签</dt><dd><Tags t={['孤例', '人类关联', '被控制', '发条兔', '恐怖旅馆设定']} /></dd>
      </>}>
      <section className="mcf-sec">
        <h4>她说过的话</h4>
        {tier >= 2 ? (<>
          <Lines rows={PITCH.slice(0, 4).map(say => ({ when: '音箱', say }))} />
          <p className="mcf-note">音箱底下还有一个声音：</p>
          <Lines rows={INNER.slice(0, 4).map(say => ({ when: '心声', say }))} />
        </>) : <Locked need={3} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>兔子 · 海报 · 照片</h4>
        {tier >= 3 ? (
          <Facts rows={[
            { k: '发条兔', v: '「带路」的兔子。跟到底不是员工手里就是餐厅；你停下或回头，它也停下来看你——酒店也是。可以抓住，也可以砸开。' },
            { k: '海报 A', v: '丢进北墙洞里：通向 Level 1。' },
            { k: '海报 B', v: '通向 Level 11。' },
            { k: '「参观」', v: '鞠躬伸手的邀请。拒绝她，心声会说：做得好。' },
            { k: '汇报', v: '酒店盯上你时，老板拍她的肩，她会说出你在哪儿。', hot: true },
            { k: '照片', v: '棕发棕眼、侦探大衣的女人。她不记得是谁。' },
          ]} />
        ) : <Locked need={6} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>接待记录</h4>
        {s ? (<>
          <div className="mcf-stats">
            <span>来访 <b>{s.n.visit}</b></span><span>被邀请 <b>{s.n.invite}</b></span><span>接受 <b>{s.n.accept}</b></span><span>婉拒 <b>{s.n.decline}</b></span>
            <span>发条兔 <b>{s.n.rabbit}</b></span><span>抓住 <b>{s.n.caught}</b></span><span>砸开 <b>{s.n.broken}</b></span><span>被汇报 <b>{s.n.report}</b></span>
          </div>
          <p className="mcf-note">{s.freed ? '她走了。大堂前台空着，音箱还在放那首歌。' : s.photo >= 2 ? '证件拿回来了。她看着照片，很久没有说话。' : s.photo >= 1 ? '她认出了照片。证件在行李员那里。' : '照片的事，她还不知道。'}</p>
        </>) : <p className="mcf-dim">还没有被她接待过。</p>}
      </section>
    </Shell>
  )
}

// ———————————————————————————— 厨师 E800 ————————————————————————————
export function ChefCodexFile({ engine, tier, met }: P) {
  const s = engine.hotel?.chef
  return (
    <Shell dept="恐怖旅馆 · 餐饮部" no="800" en="THE CHEF" stamp="后 厨" type="chef" epi="再来一份？"
      grid={<>
        <dt>称呼</dt><dd>厨师（The Chef）</dd>
        <dt>工号</dt><dd>800</dd>
        <dt>职务</dt><dd>餐厅后厨 · 每一道菜</dd>
        <dt>编制</dt><dd>孤例</dd>
        <dt>当值</dt><dd>营业时在灶台；打烊后整个后场</dd>
        <dt>可见</dt><dd className="mcf-dim">顾客看不见；盯久了或举起相机才看得见</dd>
        <dt>标签</dt><dd><Tags t={['孤例', '隐形', '食人', '冷库', '恐怖旅馆设定']} /></dd>
      </>}>
      <section className="mcf-sec">
        <h4>吃过之后</h4>
        {tier >= 2 ? (<>
          <Lines rows={(s?.truth ? CRAVE_TRUE : CRAVE).slice(0, 5).map(say => ({ when: '念头', say }))} />
          <p className="mcf-note">吃一口会上瘾：饿得更快，念头一直往餐厅飘。低音提琴的哈瓦那辣椒酱能压住它。</p>
        </>) : <Locked need={3} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>敲桌 · 冷库 · 锅</h4>
        {tier >= 3 ? (
          <Facts rows={[
            { k: '被看见', v: '他走过来，绕到桌子对面敲三下桌面，等你转身、等你看门。' },
            { k: '冷库', v: '一根铁管、一副手铐。用钥匙或撬棍开锁，或者扯断铁管。', hot: true },
            { k: '刀声', v: '门外传来刀从磁条上取下的声音时，就来不及了。', hot: true },
            { k: '铃与闪光', v: '他的耳朵会抽一下，然后去看看是谁。' },
            { k: '锅', v: '后厨只有一口锅有把手。没有它，他做不了饭。' },
            { k: '灶', v: '最后一台燃气灶也只有一台。关掉它，餐厅会停产一阵。' },
            { k: '打烊', v: '他会绑住正门、推上门闩。' },
          ]} />
        ) : <Locked need={6} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>后厨记录</h4>
        {s ? (<>
          <div className="mcf-stats">
            <span>吃过 <b>{s.n.meal}</b></span><span>被看见 <b>{s.n.mark}</b></span><span>敲桌 <b>{s.n.tap}</b></span><span>冷库 <b>{s.n.caught}</b></span>
            <span>开锁脱身 <b>{s.n.escKey}</b></span><span>扯断铁管 <b>{s.n.escYank}</b></span><span>关灶 <b>{s.n.stove}</b></span><span>拍到他 <b>{s.n.photo}</b></span>
          </div>
          <p className="mcf-note">{s.truth ? '你知道那是什么。' : '你还不知道盘子里是什么。'}{s.potStolen ? ' 锅在你手里。' : ''}{s.marked ? ' 他记得你的脸。' : ''}</p>
        </>) : <p className="mcf-dim">还没有在餐厅吃过饭。</p>}
      </section>
    </Shell>
  )
}

// ———————————————————————————— 爵士脑 E197 ————————————————————————————
export function JazzCodexFile({ engine, tier, met }: P) {
  const s = engine.hotel?.jazz
  return (
    <Shell dept="恐怖旅馆 · 餐饮部 · 驻场" no="197" en="THE JAZZ BRAINS" stamp="演 出" type="jazz" epi="你点名，我来吹。"
      grid={<>
        <dt>称呼</dt><dd>爵士脑（The Jazz Brains）</dd>
        <dt>工号</dt><dd>197</dd>
        <dt>职务</dt><dd>餐厅舞台 · 每晚两场</dd>
        <dt>编制</dt><dd>四人：{JAZZ_WHO_LIST.map(w => JAZZ_NAME[w]).join(' · ')}</dd>
        <dt>场间</dt><dd>吧台</dd>
        <dt>预告</dt><dd className="mcf-dim">迎宾女郎的海报</dd>
        <dt>标签</dt><dd><Tags t={['群体', '智能', '音乐', '假吸魂', '恐怖旅馆设定']} /></dd>
      </>}>
      <section className="mcf-sec">
        <h4>吧台闲话</h4>
        {tier >= 2 ? (<>
          <Lines rows={JAZZ_WHO_LIST.map(w => ({ when: JAZZ_NAME[w], say: TALK[w][0] }))} />
          {s?.priv ? <><p className="mcf-note">演完之后，私下：</p><Lines rows={JAZZ_WHO_LIST.map(w => ({ when: JAZZ_NAME[w], say: PRIVATE[w][PRIVATE[w].length > 3 ? 3 : 0] }))} /></> : null}
        </>) : <Locked need={3} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>曲目与终曲</h4>
        {tier >= 3 ? (<>
          <Facts rows={JAZZ_SONGS.map(x => ({ k: x.name, v: `${x.style} · ${x.buff}` }))} />
          <p className="mcf-note">台下听：理智慢慢回来，听完一整场再回一截；但你会不想走，半路离开会难受。终曲时他们做出吸魂的样子给监控（有时是老板本人）看——站定、低头，陪他们演完。乱动会让他们露馅。打他们没有用，他们只会很失望。</p>
        </>) : <Locked need={6} met={met} />}
      </section>
      <section className="mcf-sec">
        <h4>演出记录</h4>
        {s ? (<>
          <div className="mcf-stats">
            <span>听过 <b>{s.n.show}</b></span><span>整场 <b>{s.n.full}</b></span><span>半路离开 <b>{s.n.left}</b></span><span>配合终曲 <b>{s.fakeOk}</b></span>
            <span>露馅 <b>{s.busted}</b></span><span>点歌 <b>{s.n.request}</b></span><span>辣椒酱 <b>{s.n.sauce}</b></span><span>好感 <b>{s.favor}</b></span>
          </div>
          <p className="mcf-note">{s.reported ? '你告发了他们。台上空了。' : s.clue ? '他们告诉过你：墙上印着树的洞。' : '他们还没跟你说过真心话。'}</p>
        </>) : <p className="mcf-dim">还没有听过他们的演出。</p>}
      </section>
    </Shell>
  )
}
