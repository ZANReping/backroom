import { useState, type CSSProperties } from 'react'
import type { Engine } from '@/game/engine'
import { ENTITIES, entityForms, entitySpawnLevels, type EntityForm } from '@/game/entities'
import { LEVELS, levelLabel } from '@/game/levels'
import { audio } from '@/game/core/audio'

const entries = Object.values(ENTITIES).map(def => ({ def, forms: entityForms(def.type), levels: entitySpawnLevels(def.type) }))
const field: CSSProperties = { background: 'var(--panel)', color: 'var(--text)', borderColor: 'var(--panel-edge)', minHeight: 32 }
const action: CSSProperties = { ...field, color: 'var(--amber)' }

/** One layout and registry for every parent entity; choices survive filtering. */
export default function DevEntitySpawner({ engine }: { engine: Engine }) {
  const [query,setQuery] = useState('')
  const [scope,setScope] = useState('all')
  const [selected,setSelected] = useState<Record<string,EntityForm | ''>>({})
  const [status,setStatus] = useState('在前方 3 米的安全位置召唤。')
  const search = query.trim().toLocaleLowerCase()
  const shown = entries.filter(({def,forms,levels}) => {
    const level = scope === 'current' ? engine.levelDef.id : Number(scope)
    return (scope === 'all' || (scope === 'other' ? !levels.length : levels.some(v => v.id === level)))
      && (!search || `${def.name} ${def.type} ${forms.map(f => f.name).join(' ')}`.toLocaleLowerCase().includes(search))
  })
  return <section aria-label="实体召唤" className="space-y-2" onKeyDown={e => e.stopPropagation()}>
    <div className="grid grid-cols-2 gap-1.5">
      <label className="min-w-0 space-y-1">
        <span style={{color:'var(--text-dim)'}}>搜索实体 / 变种</span>
        <input aria-label="搜索实体或变种" className="w-full min-w-0 border px-2" style={field} type="search" value={query} placeholder="名称或英文 ID" onChange={e => setQuery(e.target.value)} />
      </label>
      <label className="min-w-0 space-y-1">
        <span style={{color:'var(--text-dim)'}}>自然生成层级</span>
        <select aria-label="实体层级筛选" className="w-full min-w-0 border px-1" style={field} value={scope} onChange={e => setScope(e.target.value)}>
          <option value="all">全部层级</option><option value="current">当前层级</option>
          {LEVELS.map(lv => <option key={lv.id} value={lv.id}>{levelLabel(lv.id)} · {lv.name}</option>)}
          <option value="other">其他 / 无自然生成</option>
        </select>
      </label>
    </div>
    <div className="flex justify-between gap-2" style={{color:'var(--text-dim)'}}><span>{shown.length} 类实体</span><span>{shown.reduce((n,v)=>n+v.forms.length,0)} 个子变种 / 初始状态</span></div>
    <p role="status" aria-live="polite" className="m-0" style={{color:'var(--text-dim)'}}>{status}</p>
    <div className="space-y-2">
      {shown.map(({def,forms}) => {
        const value = selected[def.type] ?? ''
        const chosen = forms.find(f => f.id === value)
        return <div key={def.type} data-entity={def.type} className="min-w-0 border p-2" style={{borderColor:'var(--panel-edge)',background:'color-mix(in srgb, var(--panel) 65%, transparent)'}}>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <strong className="truncate"><span aria-hidden="true" style={{color:def.color}}>● </span>{def.name}</strong>
            <span className="truncate text-[10px]" style={{color:'var(--text-dim)'}}>{def.type}</span>
          </div>
          <div className="flex min-w-0 gap-1.5">
            {forms.length ? <select aria-label={`${def.name}子变种`} className="min-w-0 flex-1 border px-1" style={field} value={value} onChange={e=>setSelected(prev=>({...prev,[def.type]:e.target.value as EntityForm | ''}))}>
              <option value="">自动 · 按原生成规则</option>
              {forms.map(f=><option key={f.id} value={f.id}>{f.name}{f.initial?'（初始状态）':''}</option>)}
            </select> : <span className="flex flex-1 items-center" style={{color:'var(--text-dim)'}}>标准形态</span>}
            <button aria-label={`召唤${def.name}`} className="shrink-0 border px-3" style={action} onClick={()=>{
              const ok = engine.devSpawnEntity(def.type,3,value || undefined)
              setStatus(ok ? `已召唤：${def.name}${chosen ? ` · ${chosen.name}` : ''}` : '附近没有安全空位，请移动后重试。')
              audio.uiTick()
            }}>召唤</button>
          </div>
          {chosen && <p className="mb-0 mt-1.5 leading-relaxed" style={{color:'var(--text-dim)'}}>{chosen.desc}{chosen.initial && ' 初始状态会随原有 AI 行为变化。'}</p>}
        </div>
      })}
      {!shown.length && <p style={{color:'var(--text-dim)'}}>没有匹配的实体，可清空搜索或切换至全部层级。</p>}
    </div>
    <button className="w-full border px-2 py-1.5" style={field} onClick={()=>{setStatus(`已环绕召唤 ${engine.devSpawnAllEntities()} 类实体，各一只。`);audio.uiTick()}}>每类一只 · 环绕召唤</button>
  </section>
}
