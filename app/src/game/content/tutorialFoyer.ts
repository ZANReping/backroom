// 前厅（序章）家中教程步骤表——TutorialDirector（engine/tutorial.ts）读取。
// 串起：看电脑新闻/论坛 → 拿手机 → 找背包（衣柜）→ 手电（床底或抽屉）→ 冰箱拿水和零食 → 出门
// → （M3）安全通道下楼 → 小区 → 第六大街（冲刺、寻人启事、便利店）→ 旧仓路后巷（调查、拍照）→ 回家。
// {action} 占位符按自定义键位（core/keybinds.ts）或移动端控件替换，见 formatHint。
import type { Engine } from '../engine'
import type { TutorialStep } from '../engine/tutorial'
import { foyerRoomAt } from '../world/foyerLayout'

const F = (eng: Engine) => eng.player.prologue?.flags ?? {}
const ev = (id: string) => (eng: Engine) => !!F(eng)['ev:' + id]
const flag = (id: string) => (eng: Engine) => !!F(eng)[id]
const always = () => true
const room = (eng: Engine) => foyerRoomAt(eng.player.x, eng.player.y)?.id
const clues = (eng: Engine) => ['graffiti', 'boxes', 'cctv'].filter((c) => F(eng)['clue_' + c]).length

const FOYER_STEPS: TutorialStep[] = [
  { id: 'look', trigger: always, hint: '{look}，环顾四周', complete: ev('look') },
  { id: 'news', trigger: always, hint: '屏幕上开着新闻网站——对准电脑按 {interact} 阅读', complete: flag('read_news') },
  { id: 'forum', trigger: flag('read_news'), hint: '论坛有新回帖在闪。再按 {interact} 看看那个帖子', complete: flag('read_forum') },
  { id: 'phone', trigger: flag('read_forum'), hint: '手机在书桌右侧的充电器上。对准它按 {interact} 拿起来', complete: flag('got_phone') },
  { id: 'phone_open', trigger: flag('got_phone'), hint: '手机装在【副手】。按 {phone} 打开手机：手电、笔记、时钟、相机', complete: ev('phone_open') },
  // 低电量提醒：旁支小提示（独立显示，不占主线纸带、不阻塞、不持久化）
  {
    id: 'phone_low', optional: true, repeatable: true,
    trigger: (eng) => !!F(eng).got_phone && !!eng.player.phone && !eng.player.phone.docked && eng.player.phone.battery < 20,
    hint: '手机电量低：回卧室，对准书桌上的充电器按 {interact} 充电',
    complete: (eng) => !eng.player.phone || eng.player.phone.docked || eng.player.phone.battery >= 20,
  },
  { id: 'backpack', trigger: ev('phone_open'), hint: '出门得背包。{move} 到衣柜前，{interact} 打开衣柜，拿出背包', complete: flag('got_backpack') },
  {
    id: 'flashlight', trigger: flag('got_backpack'),
    hint: (eng) => F(eng).flash_drawer
      ? '手电不在桌上……也许在床头柜抽屉里：{interact} 拉开抽屉'
      : '手电好像滚到床底下了：走到床边，按 {crouch} 蹲下，再按 {interact}',
    complete: flag('got_flashlight'),
  },
  { id: 'light', trigger: flag('got_flashlight'), hint: '按 {flashlight} 开关副手的光源（手机或手电）；{inventory} 里可以把手电换到【副手】', complete: ev('light_toggle') },
  {
    id: 'fridge', trigger: ev('light_toggle'),
    hint: (eng) => `去厨房，{interact} 打开冰箱，拿${F(eng).got_water ? '' : '瓶装水'}${!F(eng).got_water && !F(eng).got_snack ? '和' : ''}${F(eng).got_snack ? '' : '能量棒'}`,
    complete: (eng) => !!F(eng).got_water && !!F(eng).got_snack,
  },
  { id: 'leave', trigger: always, hint: '准备好了。到玄关，{interact} 打开防盗门出门', complete: (eng) => room(eng) === 'stair' },
  { id: 'corridor', trigger: always, hint: '楼道里黑着——走两步，或按 {jump} 跺一下脚，声控灯会亮', complete: ev('corridor_light') },
  // ---- M3：楼道 → 街道 → 旧仓路后巷 → 回家（第 2–4 幕）----
  { id: 'stairs', trigger: always, hint: '楼道东头是安全通道：对准防火门按 {interact} 下楼', complete: flag('went_down') },
  { id: 'downstairs', trigger: always, hint: '{move} 走下最后半跑楼梯，从单元门出去', complete: flag('outside') },
  { id: 'navigate', trigger: always, hint: '手机导航在小地图上：穿过小区，从南边的小区门口出去，到第六大街', complete: flag('on_street') },
  { id: 'sprint', trigger: always, hint: '这么晚了，街上没几个人。按住 {sprint} 冲刺', complete: (eng) => ev('sprint')(eng) || !!F(eng).reached_alley },
  { id: 'poster', trigger: always, hint: '公交站和电线杆上贴着寻人启事。走近，对准它按 {interact} 看看', complete: (eng) => !!F(eng).read_poster || !!F(eng).reached_alley },
  {
    id: 'mart', optional: true,
    trigger: (eng) => !!F(eng).on_street && !F(eng).act4 && eng.player.x > 64 && eng.player.x < 92 && eng.player.y > 46,
    hint: '便利店还亮着灯，可以进去看看', complete: (eng) => !!F(eng).visit_mart || !!F(eng).reached_alley,
  },
  { id: 'alley', trigger: always, hint: '沿第六大街往东，过十字路口，找到旧仓路的那条后巷', complete: flag('reached_alley') },
  { id: 'inspect1', trigger: always, hint: '巷子里看看可疑的地方：对准它按 {interact} 调查', complete: (eng) => clues(eng) >= 1 },
  { id: 'photo', trigger: always, hint: '拍下来留证据：按 {phone} 打开手机 → 相机，对准可疑处按 {interact} 拍照（存进笔记）', complete: flag('photo_any') },
  {
    id: 'inspect_all', trigger: always,
    hint: (eng) => `还有 ${3 - clues(eng)} 处没查：${[!F(eng).clue_graffiti && '墙上的涂鸦', !F(eng).clue_boxes && '湿纸箱', !F(eng).clue_cctv && '巷底墙上的旧监控'].filter(Boolean).join(' / ')}`,
    complete: (eng) => clues(eng) >= 3,
  },
  { id: 'wait_reply', trigger: always, hint: '什么都没有。……手机好像在震', complete: flag('act4') },
  { id: 'home', trigger: always, hint: '回家吧——原路返回小区', complete: () => false },
]


/** 下楼之后，家中尚未完成的主线步骤自动视为完成（不阻塞街区教程）；旁支提示不受影响。 */
const HOME_STEPS = new Set(['look', 'news', 'forum', 'phone', 'phone_open', 'backpack', 'flashlight', 'light', 'fridge', 'leave', 'corridor'])
export const FOYER_TUTORIAL: TutorialStep[] = FOYER_STEPS.map((s) => HOME_STEPS.has(s.id) ? { ...s, complete: (eng: Engine) => s.complete(eng) || !!F(eng).went_down } : s)
