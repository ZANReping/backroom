// 操作说明面板
import { audio } from '@/game/core/audio'
import { bindLabelFor } from '@/game/core/keybinds'

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  const b = bindLabelFor
  const col = (title: string, items: string[]) => (
    <div className="hud-panel p-4">
      <h3 className="font-title mb-2 text-[18px]" style={{ color: 'var(--amber)' }}>{title}</h3>
      <ul className="space-y-2 text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>
        {items.map((i) => <li key={i}>· {i}</li>)}
      </ul>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="hud-panel anim-slideUp max-h-[85dvh] w-full max-w-[720px] overflow-y-auto p-5" style={{ background: 'var(--panel)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-title text-[24px]" style={{ color: 'var(--amber)' }}>操作说明</h2>
          <button className="font-mono2 border px-3 py-1 text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={() => { audio.uiTick(); onClose() }}>关闭</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {col('目标', ['向下探索：Level 0 → 11，每层找到出口', '收集 6 盘磁带——Base Beta 的档案员要看齐了才开门', '终点在 Level 11「不夜城」，但那不是结局', 'Level 601 有两扇门。只有一扇是真的', '死亡是永久的——每一步都算数'])}
          {col('生存', ['管理饥饿 / 理智 / 体力', '黑暗会吞噬理智，灯火旁缓慢恢复', '低理智会产生幻影与低语', '饥饿归零后生命持续流失', '光会引来某些东西……'])}
          {col('操作', [
            `桌面：${b('forward')}${b('left')}${b('back')}${b('right')} 移动（或方向键）/ 点击画面锁定鼠标转视角 / ${b('sprint')} 冲刺`,
            `${b('attack')} 攻击 / ${b('jump')} 跳跃 / ${b('crouch')} 或 Ctrl 蹲伏 / ${b('quickuse')} 快捷使用持有物品 / ${b('quickdrop')} 快捷丢弃手持物品`,
            `${b('interact')} 互动（面板打开时=全部拿取）/ ${b('flashlight')} 手电 / ${b('inventory')} 或 Tab 背包 / ${b('map')} 地图 / ${b('codex')} 图鉴 / ${b('quest')} 任务 / ${b('status')} 状态 / ${b('log')} 日志 / ${b('slot1')}-${b('slot7')} 或滚轮 快捷栏 / ${b('hidehud')} 沉浸模式（隐藏 HUD 与手部）/ ${b('hidehud2')} 半沉浸（隐藏 HUD 保留手部）/ Esc 暂停`,
            '以上键位均可在 设置 → 操作 → 键位绑定 中自定义',
            '移动端：左侧虚拟摇杆移动 / 右半屏拖动转视角', '推到摇杆边缘或按住冲刺键奔跑；攻击键旁有跳跃按钮与蹲伏按钮（蹲伏点按切换）', '点按主按钮 攻击/互动，长按快捷栏使用物品',
          ])}
          {col('实体', ['听到的比看到的更危险', '奔跑的噪音会引来猎犬', '窃皮者会伪装成物品和尸体', '久坐者的尖叫会引来其他东西', '无面灵不主动攻击——别激怒它'])}
        </div>
      </div>
    </div>
  )
}
