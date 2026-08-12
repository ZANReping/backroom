// 图鉴评分组件：仿 Backrooms 中文维基的 component:nulevelclass（层级等级横幅）
// 与 component:cecs（统合实体分类系统，含形态分级图标与 IETS）
import {
  CECS_CLASS_INFO, CECS_HAZARD, CECS_NAMES, CECS_ORDER, ENTITY_CECS, ENTITY_CECS_CLASS,
  ENTITY_INTEL, IETS_CLASS_COLORS, LEVEL_SCORES, NLC_CLASS_COLORS,
  NLC_ENT_LABELS, NLC_ENV_LABELS, NLC_EXT_LABELS, levelClassText,
  type LevelScores,
} from '@/game/content/codexScores'

/** 层级等级横幅：完全复刻维基 component:nulevelclass 的排版——
 *  左编号区（LEVEL + 大编号 + 按等级截断的条纹指示条）+ 灰色分隔条 + 等级区 +
 *  三行指标（左侧色条 + 30% 同色底 + 右端随分数变化的动态图标）；
 *  入场动效复刻 nulevelclass-animation（阶梯延迟滑入）。 */
export function LevelClassBanner({ levelNo, override }: { levelNo: number; override?: LevelScores }) {
  const sc = override ?? LEVEL_SCORES[levelNo] // v54：设计模式编辑预览传 override；游戏内调用不传，行为不变
  if (!sc) return null
  const rows: [string, number, string[], 'exit' | 'env' | 'ent'][] = [
    ['逃离', sc.ext, NLC_EXT_LABELS, 'exit'],
    ['环境', sc.env, NLC_ENV_LABELS, 'env'],
    ['实体', sc.ent, NLC_ENT_LABELS, 'ent'],
  ]
  const clsText = levelClassText(sc)
  // 自定义等级（宜居/待定）没有 0–5 数值色：宜居用绿、其余用灰
  const clsNum = sc.cls ? -1 : Math.round((sc.ext + sc.env + sc.ent) / 3)
  const clsColor = sc.cls === '宜居' ? '#4a9a5a' : clsNum < 0 ? '#8c887e' : NLC_CLASS_COLORS[clsNum]
  const linesH = [0, 7, 17, 27, 37, 47][Math.max(0, clsNum)] ?? 0
  return (
    <div className="nlc mb-3">
      <div className="nlc-number" style={{ animationDelay: '0s' }}>
        <span className="nlc-level-label">LEVEL</span>
        <strong className="nlc-no">{levelNo}</strong>
        <div className="nlc-lines" style={{ height: linesH, background: clsColor }} />
      </div>
      <div className="nlc-border" />
      <div className="nlc-class" style={{ animationDelay: '0.15s' }}>
        <span className="nlc-sd">生存难度</span>
        <strong style={{ color: clsColor }}>{clsText}</strong>
      </div>
      {rows.map(([k, v, labels, icon], i) => {
        const c = NLC_CLASS_COLORS[v]
        return (
          <div
            key={k}
            className="nlc-indicator"
            style={{ background: `color-mix(in srgb, ${c} 30%, transparent)`, borderLeft: `0.4rem solid ${c}`, animationDelay: `${0.3 + i * 0.15}s` }}
          >
            <div className="nlc-ind-text">
              <strong>{k}：{v}/5</strong>
              <span>{labels[v]}</span>
            </div>
            <NlcIcon kind={icon} score={v} color={c} />
          </div>
        )
      })}
    </div>
  )
}

/** 指标行动态图标：按行类型（门/环境三角/人形）与分数（0–5）变化 */
function NlcIcon({ kind, score, color }: { kind: 'exit' | 'env' | 'ent'; score: number; color: string }) {
  const s = 26
  if (kind === 'exit') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
        <rect x="4" y="3" width="11" height="18" rx="1" />
        {score <= 1 && <path d="M10 12 h9 M16 8.5 L19.5 12 L16 15.5" />}
        {score >= 2 && score <= 3 && <><path d="M10 12 h9 M16 8.5 L19.5 12 L16 15.5" /><path d="M7 6 v12" strokeWidth="2.6" /></>}
        {score >= 4 && <><path d="M6 5 L14 20 M14 5 L6 20" strokeWidth="2.2" />{score >= 5 && <circle cx="9.5" cy="11.5" r="8.5" strokeDasharray="3 2" />}</>}
      </svg>
    )
  }
  if (kind === 'env') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
        <path d="M12 4 L21 20 H3 Z" fill={score >= 4 ? color : 'none'} fillOpacity={score >= 4 ? 0.55 : 0} />
        {score >= 2 && <path d="M12 10 v5 M12 17.6 v.2" stroke={score >= 4 ? '#fff' : color} strokeWidth="2.2" />}
        {score <= 1 && <path d="M9 16.5 h6" opacity="0.6" />}
      </svg>
    )
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      {score === 0 && <><circle cx="12" cy="12" r="8.5" /><path d="M6 6 L18 18" /></>}
      {score >= 1 && <><circle cx="10" cy="8" r="3.2" fill={score >= 3 ? color : 'none'} /><path d="M4.5 20 c0-4 2.6-6.4 5.5-6.4 s5.5 2.4 5.5 6.4" fill={score >= 3 ? color : 'none'} fillOpacity={0.5} /></>}
      {score >= 3 && <><circle cx="17.5" cy="9.5" r="2.4" fill={score >= 5 ? color : 'none'} /><path d="M14.5 20 c0-3.2 1.8-5 3.4-5 s3.1 1.8 3.1 5" fill={score >= 5 ? color : 'none'} fillOpacity={0.5} /></>}
      {score >= 5 && <circle cx="14" cy="7" r="1.6" fill={color} />}
    </svg>
  )
}

/** CECS 统合实体分类系统（仿维基 component:cecs）：标题 + 左侧编号/栖息地 + 右侧放大 IETS +
 *  带图标的形态分级横幅（clip-path 切角）+ 性质标签矩阵（命中高亮、危害类区别配色、悬停显示中文名）。 */
export function CecsBox({ entityType, no, habitat, danger, override }: {
  entityType: string; no: string; habitat: string; danger: number
  override?: { class?: string; intel?: string; props?: string[] } // v54：设计模式编辑预览；游戏内不传，行为不变
}) {
  const d = Math.max(0, Math.min(5, danger))
  const cls = override?.class ?? ENTITY_CECS_CLASS[entityType] ?? 'Enigmatic'
  const info = CECS_CLASS_INFO[cls] ?? CECS_CLASS_INFO.Enigmatic
  const intel = override?.intel ?? ENTITY_INTEL[entityType] ?? 'C'
  const props = new Set(override?.props ?? ENTITY_CECS[entityType] ?? [])
  return (
    <div className="cecs-box hud-panel mb-3 overflow-hidden p-3 text-[12px]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono2 text-[10px]" style={{ color: 'var(--amber)', letterSpacing: '0.2em' }}>CECS</span>
        <span className="font-title text-[15px]" style={{ color: 'var(--text)' }}>统合实体分类系统</span>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex gap-2">
            <span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>实体编号</span>
            <span className="font-mono2" style={{ color: 'var(--text)' }}>{no}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>栖息地</span>
            <span style={{ color: 'var(--text)' }}>{habitat}</span>
          </div>
        </div>
        {/* 放大的 IETS：威胁数字按等级着色（绿→黄→橙→红） */}
        <div className="shrink-0 text-center">
          <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)', letterSpacing: '0.2em' }}>IETS</div>
          <div className="font-title leading-none text-[30px]" style={{ color: IETS_CLASS_COLORS[d] }}>{d}{intel}</div>
        </div>
      </div>
      <div className="font-mono2 mt-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>分级</div>
      <div className="cecs-class-banner font-title mt-0.5 flex items-center gap-2 px-3 py-1.5 text-[18px]">
        <CecsClassIcon icon={info.icon} />
        {info.zh}
      </div>
      <div className="font-mono2 mt-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>性质</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {CECS_ORDER.map((code) => {
          const on = props.has(code)
          const hazard = CECS_HAZARD.has(code)
          return (
            <span
              key={code}
              title={CECS_NAMES[code] ?? code}
              className="font-mono2 border px-1.5 py-0.5 text-[10px]"
              style={on
                ? hazard
                  ? { borderColor: 'var(--blood)', color: 'var(--blood)', background: 'color-mix(in srgb, var(--blood) 12%, transparent)' }
                  : { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 12%, transparent)' }
                : { borderColor: 'var(--panel-edge)', color: 'var(--text-dim)', opacity: 0.45 }}
            >
              {code}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** 形态分级图标（18×18 描边 SVG，随分级横幅底色反色） */
function CecsClassIcon({ icon }: { icon: string }) {
  const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const
  switch (icon) {
    case 'paw': // 动物型：爪印
      return (<svg {...s}><circle cx="6.5" cy="7" r="2" /><circle cx="12" cy="5.5" r="2" /><circle cx="17.5" cy="7" r="2" /><path d="M12 11c-3 0-5.5 2.6-5.5 5.2 0 1.8 1.4 2.8 3 2.8 1 0 1.7-.5 2.5-.5s1.5.5 2.5.5c1.6 0 3-1 3-2.8C17.5 13.6 15 11 12 11Z" /></svg>)
    case 'person': // 类人
      return (<svg {...s}><circle cx="12" cy="7" r="3.4" /><path d="M5 20c0-4.2 3-6.6 7-6.6s7 2.4 7 6.6" /></svg>)
    case 'ghost': // 无形体：幽灵
      return (<svg {...s}><path d="M5 20V10a7 7 0 0 1 14 0v10l-2.4-1.8L14.2 20l-2.2-1.8L9.8 20l-2.4-1.8Z" /><circle cx="9.5" cy="10" r="0.6" fill="currentColor" /><circle cx="14.5" cy="10" r="0.6" fill="currentColor" /></svg>)
    case 'merge': // 混合型：交叠双圆
      return (<svg {...s}><circle cx="9" cy="12" r="5.5" /><circle cx="15" cy="12" r="5.5" /></svg>)
    case 'mountain': // 巨型：山峰
      return (<svg {...s}><path d="M3 19 10 6l4 7 3-4 4 10Z" /></svg>)
    case 'box': // 物品型：立方体
      return (<svg {...s}><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="M12 3v9m0 0 8-4.5M12 12 4 7.5" /></svg>)
    case 'gear': // 机械型：齿轮
      return (<svg {...s}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" /></svg>)
    case 'question': // 隐秘：问号
      return (<svg {...s}><path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.2c-.9.5-1.5 1-1.5 2.3" /><circle cx="12" cy="18" r="0.8" fill="currentColor" /></svg>)
    case 'leaf': // 植菌型：叶片
      return (<svg {...s}><path d="M5 19C5 9 12 4 20 4c0 8-5 15-15 15Z" /><path d="M5 19C8 14 12 10 17 7" /></svg>)
    case 'cell': // 单细胞
      return (<svg {...s}><ellipse cx="12" cy="12" rx="8" ry="6.5" /><circle cx="12" cy="12" r="2.4" /></svg>)
    case 'planet': // 天体：行星环
      return (<svg {...s}><circle cx="12" cy="12" r="5.5" /><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-18 12 12)" /></svg>)
    case 'crown': // 神性：冠冕
      return (<svg {...s}><path d="M4 18 5.5 8l4.2 4.5L12 6l2.3 6.5L18.5 8 20 18Z" /></svg>)
    case 'shield': // 濒危：护盾
      return (<svg {...s}><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6Z" /></svg>)
    case 'skull': // 灭绝：颅骨
      return (<svg {...s}><path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.5 4.8 3.5 5.7V21h9v-4.3C18.5 15.8 20 13.8 20 11a8 8 0 0 0-8-8Z" /><circle cx="9" cy="11" r="1" fill="currentColor" /><circle cx="15" cy="11" r="1" fill="currentColor" /></svg>)
    default:
      return null
  }
}
