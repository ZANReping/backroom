import { createRoot } from 'react-dom/client'
import { ALL_LEVEL_DEFS, levelNo } from '/src/game/levels'
import { levelTitleTheme } from '/src/components/levelTitleTheme'
import LevelTitleOrnament from '/src/components/LevelTitleOrnament'
import '/src/index.css'
import '/src/components/LevelTitleTheme.css'

createRoot(document.querySelector('#root')!).render(<>
  <style>{`body { overflow: auto; } .title-gallery { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; background:#222; padding:1px; } .title-sample { min-height:245px; padding:22px; background:#000; display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; } .title-sample .level-title__name { font-size:32px; } @media(max-width:650px){.title-gallery{grid-template-columns:1fr;}}`}</style>
  <main className="title-gallery">{ALL_LEVEL_DEFS.map(def => {
    const theme = levelTitleTheme(def.id)
    return <article key={def.id} data-title-theme={theme} className={`title-sample ${theme === 'default' ? '' : 'level-title-themed'}`}>
      <LevelTitleOrnament theme={theme} />
      <div className="level-title__eyebrow font-mono2" style={{ color: 'var(--title-accent, var(--exit))', letterSpacing: '.3em', fontSize: 16 }}>LEVEL {levelNo(def.id)}</div>
      <div className="level-title__name font-title mt-3" style={{ color: 'var(--title-ink, var(--text))' }}>「{def.name}」</div>
    </article>
  })}</main>
</>)
