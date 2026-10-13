import type {DocDef} from '@/game/content/docs'
import {textureUrl} from '@/game/renderer/shared'
export default function ManilaLetter({doc,onClose}:{doc:DocDef;onClose:()=>void}){
 return <article data-manila-letter className="anim-slideUp relative flex max-h-[88dvh] w-full max-w-[1080px] flex-col overflow-hidden rounded-sm" aria-label={doc.title} style={{background:'#fff',color:'#111',boxShadow:'0 16px 60px #0008'}} onClick={e=>e.stopPropagation()}>
  <div className="overflow-y-auto px-5 pb-6 pt-5 sm:px-8" style={{fontFamily:"'SimSun','Songti SC',serif"}}>
   <img src={textureUrl('documents/manila-mary-logo.png')} alt="Manila Mary Foundation" className="mx-auto mb-4 h-auto w-[156px]"/>
   {doc.body.flatMap(s=>s.paras).map((p,i)=><p key={i} style={{fontSize:'clamp(16px,2vw,21px)',lineHeight:1.65,margin:'0 0 22px'}}>{i===3?<>{p.split('一旦')[0]}<span style={{color:'#b9947b'}}>一旦{p.split('一旦')[1]}</span></>:p}</p>)}
  </div>
  <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{color:'#817960',borderColor:'#e4e0d5',fontSize:11}}>
   <span><a href="https://backrooms-wiki-cn.wikidot.com/manila-room" target="_blank" rel="noreferrer">马尼拉房间</a> · Br Miller / Neptunium · 译 calf-0 / xuziqi · CC BY-SA 3.0</span>
   <button onClick={onClose} className="border px-4 py-2" style={{color:'#5b5140',borderColor:'#d7cfbb'}}>放回（Esc）</button>
  </footer>
 </article>
}
