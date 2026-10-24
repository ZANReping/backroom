// 枪械 HUD（鎏金兵械库）：快捷栏上方一条——枪名 · 弹仓（实心 = 未击发，空心 = 空壳，虚线 = 空膛；杠杆步枪 = 膛 + 管式弹仓计数；前装 = 装填进度）· 选定弹种与余量 · 动作状态
import type { Engine } from '../game/engine'
import { AMMO, GUNS, MUZZLE_STAGES, MUZZLE_STAGE_LABEL, isAmmo, isGun, type AmmoType, type GunType } from '../game/content/firearms'
import { gunAmmoSel, gunMag, muzzleStage, tubeCount } from '../game/engine/firearms'

const ACT_LABEL: Record<GunType, Record<string, string>> = {
  dbshotgun: { open: '折枪', extract: '拔弹', insert: '装弹', close: '合枪' },
  trapdoor: { open: '掀活门', extract: '拔弹', insert: '装弹', close: '合活门' },
  leverrifle: { open: '转出装弹口', extract: '退弹', insert: '压弹', close: '收枪', cycle: '拉杆' },
  revolver: { open: '开装弹门', extract: '退壳', insert: '装弹', close: '关门' },
  musket: { close: '端枪' },
}

export function GunHud({ engine }: { engine: Engine }) {
  const p = engine.player, s = p.hotbar[p.selected]
  if (!s || !isGun(s.type) || engine.handsStowed) return null
  const def = GUNS[s.type as GunType], mag = gunMag(s), sel = gunAmmoSel(engine, s), run = engine.gun
  const reserve = engine.countItem(sel)
  const busy = run.act === 'stage' && run.step?.stage ? MUZZLE_STAGE_LABEL[run.step.stage] : ACT_LABEL[def.type][run.act]
  const cells = def.reload.kind === 'tube' ? mag.slice(0, 1) : mag
  return (
    <div data-gun-hud className="hud-panel font-mono2 flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2.5 py-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
      <span style={{ color: 'var(--text)' }}>{def.name}</span>
      <span className="flex items-center gap-1">
        {cells.map((c, i) => {
          const a = isAmmo(c) ? AMMO[c] : null
          return (
            <span key={i} title={a ? a.name : c === 'spent' ? '空壳' : '空膛'} className="inline-flex flex-col items-center" style={{ width: 22 }}>
              <span style={{
                width: 9, height: 15, borderRadius: 2,
                background: a ? a.hull : 'transparent',
                border: `1.5px ${c ? 'solid' : 'dashed'} ${a ? '#c9a45a' : c === 'spent' ? '#8a7a62' : '#5a554c'}`,
                boxShadow: a?.special ? '0 0 4px #ffd94d' : undefined,
              }} />
              <span className="text-[9px] leading-none mt-0.5" style={{ color: a ? 'var(--text)' : '#6a645a' }}>{a ? a.short : c === 'spent' ? '空壳' : '—'}</span>
            </span>
          )
        })}
      </span>
      {def.reload.kind === 'tube' && <span title="管式弹仓">弹仓 {tubeCount(s)}/{def.capacity - 1}</span>}
      {def.reload.kind === 'muzzle' && muzzleStage(s) < MUZZLE_STAGES.length && <span title="前装进度">装填 {muzzleStage(s)}/{MUZZLE_STAGES.length}</span>}
      <span>
        <span style={{ color: AMMO[sel as AmmoType].special ? 'var(--amber)' : 'var(--text)' }}>{AMMO[sel as AmmoType].name}</span> ×{reserve}
      </span>
      {busy && <span style={{ color: 'var(--amber)' }}>{busy}…</span>}
      {!busy && run.aim > 0.5 && <span style={{ color: 'var(--amber)' }}>瞄准</span>}
    </div>
  )
}
