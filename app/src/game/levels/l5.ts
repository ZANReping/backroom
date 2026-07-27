// Level 5「恐怖酒店」层级定义（严格按设计文档 §3/§6）
import type { LevelDef } from '../types'

export const L5: LevelDef = {
  id: 5,
  name: '恐怖酒店',
  flavor: '1930 年代的酒店综合体。老式唱机随机播放爵士乐；死亡飞蛾的主巢——你的手电是它们的邀请函。',
  lore: 'Level 5「Terror Hotel」。1930 年代装潢的无限酒店：红木红金墙纸、异域红地毯、贝弗利舞厅与锅炉房。异常洁净（污渍自行消失）；唱机播放爵士乐，墙后有派对喧闹与低语。确认实体：死亡飞蛾（主巢之一）、猎犬、窃皮者。M.E.G. Outpost「Housekeeping」驻扎于此。——据 Backrooms Wikidot 整理',
  palette: { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#4a2628', wallTop: '#3a1e20', accent: '#a9843a', light: '#ffd9a0', decal: '#462427' },
  gen: 'hotel',
  size: 76,
  skipPrefabs: ['guestroom', 'beverlyhall'], // v8：客房/宴会厅由酒店布局生成器内置（门等距 door stacks）
  entities: [
    // wiki：死亡飞蛾主巢（雌雄皆有）、猎犬、窃皮者；侍者与镜中人为本层特有
    { type: 'deathmoth', w: 18, min: 4, max: 7 },
    { type: 'hound', w: 10, min: 1, max: 2 },
    { type: 'skinstealer', w: 10, min: 1, max: 2 },
    { type: 'bellhop', w: 8, min: 1, max: 2 },
    { type: 'mirrorself', w: 6, min: 0, max: 2 },
  ],
  items: [
    { type: 'skeleton', w: 6 },
    { type: 'silverware', w: 10 },
    { type: 'sedative', w: 10 },
  ],
  itemCount: [12, 16],
  structures: ['frontdesk', 'door', 'ballroom', 'bed', 'sconce', 'mirror', 'crate', 'corpse', 'suitcase', 'locker', 'fridge', 'safebox'],
  containerBias: 0.55,
  sd: 'Survival Difficulty: Class 2 · M.E.G. Outpost「Housekeeping」驻扎',
  exits: [
    // v23：Wikidot 正典连接——从 Level 5 的锅炉房进入 Level 6，本层不再是终点
    { kind: 'boilerdeep', name: '锅炉房深处', dest: 6, anim: 'iris', cutIn: 'dark' },
    { kind: 'servicelift', name: '货运梯', dest: 'random', anim: 'shutter' },
    { kind: 'mirror', name: '镜子切出', dest: 'random', anim: 'glitch' },
  ],
  entrance: '消防通道',
  exitDesc: '出口：锅炉房深处（→ Level 6「Lights Out」，Wikidot 推荐的建基路线）、货运梯（随机层级）、镜子切出（随机层级）。大堂旋转门推不动——它从来就不通向外面。',
  lightDensity: 0.009,
  darkness: 0.6,
}
