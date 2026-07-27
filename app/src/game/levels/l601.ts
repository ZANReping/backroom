// Level 601「The End」——结局层（数组索引 12，对玩家显示 601）
// 设定依据：The Backrooms Wiki（Wikidot）Level 601。一个伪装成逃脱路线的陷阱层：
// 近乎无限的现代图书馆，中央有金属字母拼出 "the end is near"；
// 它会为闯入者制造个人化的假现实，复刻其熟悉的环境，让人以为自己已经安全到家。
// 实为死循环，栖息着 Partygoers。
//
// 注：Wikidot FAQ 明确「离开后室是一个敏感话题」，且本站不以某一种唯一正典解释运作；
// 《Basics of the Backrooms》的口径是「从未有过任何有记录的逃脱」。
// 本作据此把「回家」处理成假结局，把「看穿它」处理成真结局。
import type { LevelDef } from '../types'

export const L601: LevelDef = {
  id: 12,
  displayId: 601,
  name: '终末',
  sd: 'Survival Difficulty: Class 3 · 伪装成逃脱路线的陷阱层',
  flavor: '一座近乎无限的现代图书馆。空气里有纸和地板蜡的味道，中央的金属字母拼着 the end is near。走廊尽头那扇门后面，是你家的玄关——灯是开着的。',
  lore: 'Level 601「The End」。内部是一座近乎无限的现代图书馆，中央有金属字母拼出 "the end is near"。它会为闯入者制造个人化的假现实，复刻其熟悉的环境，让人以为自己已经安全到家；实为死循环，栖息着 Partygoers（Entity 67）。⚠ Wikidot FAQ 的原话是：「离开后室是一个敏感话题。有些作品的写作前提是不存在已知的离开方式，而另一些则暗示存在这种可能性。」并明确「本站并不以某一种唯一的正典解释来运作」。《Basics of the Backrooms; A Guide》的口径更硬：「从未有过任何有记录的逃脱」「后室没有出口」，并警告尝试逃脱极可能只会把你带到更危险的层级。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#b9a888', floorAlt: '#ad9c7c', wall: '#d6c9ab', wallTop: '#e2d7bd',
    accent: '#8a6a3a', light: '#fff0cc', decal: '#6a5a3e',
  },
  gen: 'library',
  size: 64,
  allExits: true,      // 真假两扇门必须同时存在
  noRandomDest: true,  // 「random」出口永远不会把玩家丢进结局层
  entryAnim: 'step',
  containerBias: 0.35,
  entities: [
    { type: 'partygoer', w: 20, min: 2, max: 4 },
    { type: 'windowent', w: 8, min: 1, max: 2 },
  ],
  items: [
    { type: 'endnote', w: 18 },
    { type: 'oddbook', w: 12 },
  ],
  itemCount: [9, 13],
  structures: ['libshelf', 'endletters', 'homedoor', 'table', 'sconce', 'corpse', 'crate', 'locker'],
  exits: [
    // 假结局：你家的前门。走进去，你会「回家」——然后在图书馆里醒来。
    { kind: 'homedoor', name: '你家的前门', dest: 12, anim: 'bloom', cutIn: 'step' },
    // 真结局：金属字母底下那扇没有装饰的门。
    { kind: 'trueend', name: '金属字母底下的门', dest: 'win', anim: 'dawn' },
  ],
  entrance: 'Level 11 · M.E.G. Base Beta 档案室',
  exitDesc: '出口：两扇。一扇是你家的前门——灯开着，鞋摆得整整齐齐，钥匙在门口的小碟子里。另一扇在中央那排金属字母底下，没有装饰，也没有灯。Level 601 只对识破它的人开一次门。',
  lightDensity: 0.014,
  darkness: 0.3,
}
