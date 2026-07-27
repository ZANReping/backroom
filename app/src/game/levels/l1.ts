// Level 1「停车场」层级定义（严格按设计文档 §3/§6）
import type { LevelDef } from '../types'

export const L1: LevelDef = {
  id: 1,
  name: '停车场',
  flavor: '混凝土立柱与悬挂荧光灯。杏仁水水洼蒸发的浓雾压低能见度。猎犬与钝人在车位间游荡。',
  lore: 'Level 1 地下停车场。闷热（30–35°C）、非欧几里得空间；维护走廊停电期间仍有电，可作短暂避难所。确认实体：无面灵、猎犬、钝人、团块、死亡飞蛾；另有假水洼与活画等本层独占威胁。停电事件发生时实体倾巢而出。——据 Backrooms Fandom 整理',
  palette: { floor: '#3d3d3f', floorAlt: '#353537', wall: '#555558', wallTop: '#6b6b6e', accent: '#e8e8e0', light: '#d9c39a', decal: '#2e2e30' },
  gen: 'garage',
  size: 72,
  entities: [
    // Fandom 确认实体：无面灵、团块、猎犬、钝人、死亡飞蛾；运输车为本层特有巡逻实体
    { type: 'duller', w: 14, min: 2, max: 3 },
    { type: 'hound', w: 12, min: 1, max: 2 },
    { type: 'faceling', w: 10, min: 1, max: 3 },
    { type: 'clump', w: 8, min: 0, max: 2 },
    { type: 'carrier', w: 6, min: 0, max: 1 },
    { type: 'deathmoth', w: 6, min: 0, max: 2 },
  ],
  items: [
    { type: 'carkey', w: 12 },
    { type: 'gas', w: 10 },
  ],
  itemCount: [10, 14],
  structures: ['pillar', 'car', 'booth', 'graffiti', 'crate', 'corpse', 'vent', 'toolbox', 'locker', 'suitcase'],
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 2 · 闷热 30–35°C · 非欧几里得空间',
  exits: [
    { kind: 'freight', name: '货运电梯', dest: 2, anim: 'shutter', req: { lever: true }, reqText: '需要扳动电源拉杆' },
    { kind: 'hatch', name: '维修通道', dest: 2, anim: 'iris' },
    { kind: 'stairs', name: '楼梯间', dest: 0, anim: 'bloom' },
  ],
  entrance: '消防门 / 坠落点',
  exitDesc: '出口：货运电梯（需扳动收费亭电源拉杆→B2）、维修通道（→B2）、楼梯间（→B0）。未上锁的门小概率通向更深层。',
  lightDensity: 0.008,
  darkness: 0.7,
}
