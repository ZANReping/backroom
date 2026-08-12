// v53：难度定义（自 engine.ts 拆分；dev.ts 与引擎主循环共用，避免模块间循环引用）
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFF = { easy: { dmg: 0.6, drain: 0.6 }, normal: { dmg: 1, drain: 1 }, hard: { dmg: 1.5, drain: 1.4 } }
