import {useEffect, useRef, useState, type KeyboardEvent} from 'react'
import {engine} from '@/game/engine'
import {bntgCashCapacity, BNTG_BALANCE_MAX, type BntgBankEntry} from '@/game/engine/bntgBank'
import './BntgAtm.css'

type Screen='home'|'amount'|'confirm'|'processing'|'receipt'|'balance'|'statement'
type Operation='deposit'|'withdraw'
const number=(n:number)=>n.toLocaleString('zh-CN')
const date=(n:number)=>new Date(n).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})
const titles={deposit:'存款',withdraw:'取款',purchase:'商户消费',exchange:'货币兑换',service:'服务付款'}
function TerminalIcon({kind}:{kind:'deposit'|'withdraw'|'balance'|'statement'}){
 return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
  {kind==='deposit'||kind==='withdraw'?<><path d="M5 20v7h22v-7M9 23h14"/>{kind==='deposit'?<path d="M16 3v15m-5-5 5 5 5-5"/>:<path d="M16 19V4m-5 5 5-5 5 5"/>}</>:kind==='balance'?<><path d="M4 9h24v17H4zM4 13h24M22 18h6v5h-6z"/><path d="m6 9 17-5v5"/></>:<><path d="M8 3h16v26l-4-2-4 2-4-2-4 2zM12 9h8M12 14h8M12 19h5"/></>}
 </svg>
}
export default function BntgAtm({atmId,onClose}:{atmId:string;onClose:()=>void}){
 const [screen,setScreen]=useState<Screen>('home'),[operation,setOperation]=useState<Operation>('deposit')
 const [amount,setAmount]=useState(''),[error,setError]=useState(''),[receipt,setReceipt]=useState<BntgBankEntry|null>(null)
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const cash=engine.countItem('presses'),balance=engine.bntgBank.balance,value=Number(amount)
 const maxAmount=operation==='deposit'?Math.min(cash,BNTG_BALANCE_MAX-balance):Math.min(balance,bntgCashCapacity(engine))
 const valid=/^[0-9]+$/.test(amount)&&Number.isSafeInteger(value)&&value>0&&value<=maxAmount
 const terminal=atmId.endsWith('.1')?'02':'01'
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;root.current?.focus()
  return()=>{if(timer.current!==null)clearTimeout(timer.current);previous?.focus()}
 },[])
 useEffect(()=>{const content=root.current?.querySelector('.atm-content');if(content)content.scrollTop=0;if(screen==='amount')input.current?.focus();else root.current?.focus()},[screen])
 const home=()=>{if(busy.current)return;setScreen('home');setAmount('');setError('')}
 const choose=(op:Operation)=>{setOperation(op);setAmount('');setError('');setScreen('amount')}
 const setDigits=(text:string)=>{setAmount(text.replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,'').slice(0,9));setError('')}
 const confirm=()=>{
  if(busy.current)return
  if(screen==='amount'){
   if(!valid){setError(value>maxAmount?(operation==='deposit'?'随身压印币不足，或超出账户可存入额度。':'信用点或背包空间不足，请减少取款金额。'):'请输入大于零的整数金额。');return}
   setScreen('confirm');return
  }
  if(screen!=='confirm')return
  // Commit once at the confirmation boundary; the animation never performs a second transfer.
  busy.current=true
  const result=engine.bntgBankTransaction(atmId,operation,value)
  if(!result.ok){busy.current=false;setError(result.message);setScreen('amount');return}
  setReceipt(result.entry!);setScreen('processing')
  timer.current=setTimeout(()=>{busy.current=false;timer.current=null;setScreen('receipt')},420)
 }
 const correct=()=>{if(busy.current)return;if(screen==='confirm')setScreen('amount');else if(screen==='amount')setDigits(amount.slice(0,-1))}
 const key=(key:string)=>{if(screen==='amount')setDigits(key==='clear'?'':key==='back'?amount.slice(0,-1):amount+key)}
 const cancel=()=>{if(busy.current)return;if(screen==='home')onClose();else home()}
 const keyboard=(e:KeyboardEvent<HTMLDivElement>)=>{
  // Keep Escape and movement keys inside the paused terminal, including its keypad.
  e.stopPropagation()
  if(e.key==='Escape'){e.preventDefault();cancel();return}
  if(e.key==='Tab'){
   const els=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0)
   const first=els[0],last=els[els.length-1],active=document.activeElement
   if(e.shiftKey&&(active===first||active===root.current)){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&(active===last||active===root.current)){e.preventDefault();first?.focus()}
   return
  }
  if(e.key==='Enter'&&(e.target===input.current||e.target===root.current)){e.preventDefault();confirm();return}
  if(e.target!==input.current&&screen==='amount'&&/^[0-9]$/.test(e.key)){e.preventDefault();key(e.key)}
 }
 return <div className="bntg-atm-overlay">
  <div className="bntg-atm" role="dialog" aria-modal="true" aria-labelledby="atm-title" tabIndex={-1} ref={root} onKeyDown={keyboard} data-atm-screen={screen}>
   <header className="atm-canopy">
    <div className="atm-brand"><span className="atm-monogram" aria-hidden="true">B</span><div><strong id="atm-title">B.N.T.G.</strong><span>商人之家 · 银行自助服务</span></div></div>
    <div className="atm-terminal"><span><i/>终端正常</span><small>TK / BANK / {terminal}</small></div>
    <button className="atm-close" aria-label="关闭 ATM" disabled={screen==='processing'} onClick={onClose}>×</button>
   </header>
   <div className="atm-body">
    <section className="atm-bezel" aria-label="终端屏幕">
     <div className="atm-lcd">
      <div className="atm-screen-top"><span>个人结算账户</span><span>信用点 / CR</span></div>
      <div className="atm-content" aria-live="polite" aria-busy={screen==='processing'}>
       {screen==='home'&&<>
        <p className="atm-eyebrow">SELF-SERVICE BANKING</p><h2>欢迎使用银行自助终端</h2><p className="atm-intro">存入压印币，使用信用点与 B.N.T.G. 商人交易。</p>
        <div className="atm-balance-strip"><span>可用余额<strong data-atm-balance>{number(balance)} <small>信用点</small></strong></span><span>随身现金<strong data-atm-cash>{number(cash)} <small>压印币</small></strong></span></div>
        <div className="atm-menu">
         <button onClick={()=>choose('deposit')}><TerminalIcon kind="deposit"/><span>存入压印币<small>DEPOSIT</small></span><b>›</b></button>
         <button onClick={()=>choose('withdraw')}><TerminalIcon kind="withdraw"/><span>取出压印币<small>WITHDRAW</small></span><b>›</b></button>
         <button onClick={()=>setScreen('balance')}><TerminalIcon kind="balance"/><span>查询余额<small>BALANCE</small></span><b>›</b></button>
         <button onClick={()=>setScreen('statement')}><TerminalIcon kind="statement"/><span>交易明细<small>STATEMENT</small></span><b>›</b></button>
        </div>
        <p className="atm-footnote">1 枚压印币 = 1 信用点 · 存取款免手续费</p>
       </>}
       {screen==='amount'&&<>
        <p className="atm-eyebrow">{operation==='deposit'?'DEPOSIT':'WITHDRAW'} / 01</p><h2>{operation==='deposit'?'存入压印币':'取出压印币'}</h2>
        <p className="atm-intro">{operation==='deposit'?'金额确认后，将从随身物品中收取压印币。':'确认后，压印币将放入快捷栏或背包。'}</p>
        <label className="atm-amount">请输入金额<span><input ref={input} aria-label="存取款金额" aria-describedby="atm-amount-limit atm-amount-error" aria-invalid={Boolean(error)} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={9} value={amount} onChange={e=>setDigits(e.target.value)} placeholder="0"/><b>枚</b></span></label>
        <div className="atm-quick">{[10,50,100].map(n=><button key={n} disabled={n>maxAmount} onClick={()=>setDigits(String(n))}>{n}</button>)}<button disabled={!maxAmount} onClick={()=>setDigits(String(maxAmount))}>全部可{operation==='deposit'?'存':'取'}</button></div>
        <p className="atm-limit" id="atm-amount-limit">当前可{operation==='deposit'?'存':'取'} <strong>{number(maxAmount)}</strong> 枚{operation==='withdraw'?'（已计入背包容量）':''}</p>
        <p className="atm-error" id="atm-amount-error" role="alert">{error||' '}</p>
        <div className="atm-actions"><button onClick={home}>返回</button><button className="atm-primary" onClick={confirm}>下一步 ›</button></div>
       </>}
       {screen==='confirm'&&<>
        <p className="atm-eyebrow">CONFIRM / 02</p><h2>请核对{titles[operation]}信息</h2>
        <div className="atm-confirm-amount"><small>{titles[operation]}金额</small><strong>{number(value)} <span>枚压印币</span></strong></div>
        <dl className="atm-details"><div><dt>账户变动</dt><dd>{operation==='deposit'?'+':'−'}{number(value)} 信用点</dd></div><div><dt>手续费</dt><dd>0</dd></div><div><dt>完成后可用余额</dt><dd>{number(balance+(operation==='deposit'?value:-value))} 信用点</dd></div><div><dt>完成后随身现金</dt><dd>{number(cash+(operation==='deposit'?-value:value))} 枚</dd></div></dl>
        <div className="atm-actions"><button onClick={correct}>修改金额</button><button className="atm-primary" onClick={confirm} data-atm-confirm>确认{titles[operation]}</button></div>
       </>}
       {screen==='processing'&&<div className="atm-processing"><span className="atm-spinner"/><h2>正在办理，请稍候</h2><p>{operation==='deposit'?'正在核验入账记录':'正在完成出钞记录'}</p></div>}
       {screen==='receipt'&&receipt&&<>
        <div className="atm-receipt"><span className="atm-success">✓</span><p className="atm-eyebrow">TRANSACTION COMPLETE</p><h2>{titles[receipt.kind]}成功</h2><p>{receipt.detail}</p>
         <dl className="atm-details"><div><dt>交易编号</dt><dd>TK-{String(receipt.id).padStart(6,'0')}</dd></div><div><dt>办理时间</dt><dd>{date(receipt.at)}</dd></div><div><dt>可用余额</dt><dd>{number(receipt.balance)} 信用点</dd></div></dl><small>请妥善保管现金 · 感谢使用 B.N.T.G. 自助服务</small></div>
        <div className="atm-actions"><button onClick={onClose}>结束服务</button><button className="atm-primary" onClick={home}>继续办理</button></div>
       </>}
       {screen==='balance'&&<>
        <p className="atm-eyebrow">ACCOUNT BALANCE</p><h2>账户余额</h2><div className="atm-confirm-amount"><small>可用信用点</small><strong>{number(balance)} <span>CR</span></strong></div>
        <dl className="atm-details"><div><dt>随身压印币</dt><dd>{number(cash)} 枚</dd></div><div><dt>兑换比例</dt><dd>1 : 1</dd></div><div><dt>账户用途</dt><dd>B.N.T.G. 商户结算</dd></div></dl><p className="atm-intro">交易时可选择信用点、压印币或优先使用信用点。余额随当前存档保存。</p><div className="atm-actions"><button onClick={home}>返回主菜单</button><button className="atm-primary" onClick={()=>choose('deposit')}>存款</button></div>
       </>}
       {screen==='statement'&&<>
        <p className="atm-eyebrow">ACCOUNT ACTIVITY</p><h2>最近交易</h2><p className="atm-intro">显示最近 12 笔记录 · 金额单位：信用点</p>
        <div className="atm-statement" tabIndex={0} aria-label="最近交易记录">
         {!engine.bntgBank.history.length?<p className="atm-empty">暂无交易记录</p>:[...engine.bntgBank.history].reverse().map(e=><article key={e.id}><div><strong>{titles[e.kind]}</strong><b className={e.delta>0?'atm-positive':''}>{e.delta>0?'+':''}{number(e.delta)}</b></div><p>{e.detail}</p><small>{date(e.at)} · 余额 {number(e.balance)}</small></article>)}
        </div><div className="atm-actions"><button onClick={home}>返回主菜单</button></div>
       </>}
      </div>
      <footer className="atm-screen-footer"><span>TRADERS KEEP</span><span>安全结算 · 无手续费</span></footer>
     </div>
    </section>
    <aside className="atm-controls" aria-label="ATM 操作键盘">
     <div className="atm-account-mark"><i/><span>账户已连接<small>PERSONAL ACCOUNT</small></span></div>
     <div className="atm-card-reader" aria-hidden="true"><span/><i/></div>
     <span className="atm-hardware-label">金额输入 / AMOUNT</span>
     <div className="atm-keypad">{['1','2','3','4','5','6','7','8','9','clear','0','back'].map(k=><button key={k} disabled={screen!=='amount'} aria-label={k==='clear'?'清空金额':k==='back'?'删除一位':`数字 ${k}`} onClick={()=>key(k)}>{k==='clear'?'C':k==='back'?'←':k}</button>)}</div>
     <div className="atm-function-keys"><button className="atm-cancel" disabled={screen==='processing'} onClick={cancel}>取消 <small>CANCEL</small><span>×</span></button><button className="atm-correct" disabled={screen!=='amount'&&screen!=='confirm'} onClick={correct}>更正 <small>CORRECT</small><span>←</span></button><button className="atm-enter" disabled={screen!=='amount'&&screen!=='confirm'} onClick={confirm}>确认 <small>ENTER</small><span>↵</span></button></div>
     <p className="atm-hardware-note">请核对金额后确认<br/>离开前请结束服务</p>
    </aside>
   </div>
   <footer className="atm-hardware-bottom"><div><span>压印币存入口 / DEPOSIT</span><div className={'atm-slot '+(screen==='processing'&&operation==='deposit'?'is-active':'')}><i/></div></div><div><span>现金出口 / CASH</span><div className={'atm-slot '+(screen==='receipt'&&operation==='withdraw'?'is-active':'')}><i/></div></div><small>B.N.T.G. BANKING<br/>TK-{terminal} · LEVEL 1</small></footer>
  </div>
 </div>
}
