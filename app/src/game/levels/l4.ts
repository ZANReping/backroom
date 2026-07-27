// Level 4「废弃办公室」层级定义（严格按设计文档 §3/§6）
import type { LevelDef } from '../types'

export const L4: LevelDef = {
  id: 4,
  name: '废弃办公室',
  flavor: '空旷的办公大楼，杏仁水出现频率全后室最高。官方仅确认猎犬与钝人出没——囤积补给，准备去更深层。',
  lore: 'Level 4「Abandoned Office」。空旷办公大楼，大多数窗户被涂黑（未涂黑的是陷阱，必须避开）；杏仁水出现频率全后室最高，是流浪者的补给与聚集枢纽。官方仅确认实体：猎犬与钝人。M.E.G. Base Omega 重兵把守于此。——据 Backrooms Wikidot 整理',
  palette: { floor: '#5c5548', floorAlt: '#524b40', wall: '#8f8a7c', wallTop: '#6e6a5c', accent: '#7fb0c9', light: '#ffe9b0', decal: '#463f35' },
  gen: 'office',
  size: 70,
  entities: [
    { type: 'hound', w: 12, min: 1, max: 2 },
    { type: 'duller', w: 12, min: 1, max: 2 },
  ],
  items: [
    // wiki：杏仁水出现频率全后室最高（饮水机/售货机/喷泉）→ 额外高权重
    { type: 'almond', w: 30 },
    { type: 'coffee', w: 12 },
    { type: 'stapler', w: 8 },
    { type: 'keycard', w: 6 },
  ],
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 2 · 杏仁水全后室最富集 · 未涂黑的窗户是陷阱',
  itemCount: [12, 16],
  structures: ['cubicle', 'copier', 'server', 'vending', 'desk', 'crate', 'corpse', 'locker', 'fridge', 'safebox'],
  exits: [
    { kind: 'stafflift', name: '员工电梯', dest: 5, anim: 'shutter', req: { keycard: true }, reqText: '需要门禁卡' },
    { kind: 'window', name: '落地窗', dest: 'random', anim: 'fall', fallDamage: 30 },
    { kind: 'fireexit', name: '消防通道', dest: 5, anim: 'bloom' },
  ],
  entrance: '应急楼梯',
  exitDesc: '出口：员工电梯（需门禁卡→B5）、消防通道（→B5）、落地窗（坠落→随机层级，重伤）。',
  lightDensity: 0.008,
  darkness: 0.65,
}
