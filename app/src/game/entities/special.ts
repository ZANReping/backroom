// 实体定义（设定依据 Backrooms Wikidot / Fandom 官方条目，M.E.G. 档案风格）
import type { EntityDef } from './types'

// 黑暗/能量特殊实体（笑魇/电弧体）
export const SPECIAL_ENTITIES: Record<string, EntityDef> = {
  smiler: {
    type: 'smiler', name: '笑魇', hp: 40, speed: 2.4, damage: 22, sight: 7, hearing: 4, darkAmbusher: true, color: '#e8e8e0', habitat: 'any',
    desc: '黑暗中浮现的反光笑脸与齿列，身形近乎不可见。',
    codex: {
      no: 'Entity 3「Smilers」', danger: '4 级（高威胁）', habitat: 'Level 2 / Level 3 的无光角落 · Level 8 Handyland',
      behavior: '只栖息在绝对黑暗中。光照下会后退回避；一旦你的光源熄灭，它便无声逼近，视野在黑暗中反而更远。',
      counter: '保持手电常亮，它会主动退开；切勿在黑暗中停留。听到黑暗里的笑声时立刻点亮光源。',
      lore: [
        '「笑魇」是后室中最广为人知的敌对实体之一。它没有可见的躯干——目击报告一致描述为「黑暗中悬浮的一排牙齿和两只反光的眼睛」。',
        '该实体对光表现出强烈的回避反应。M.E.G. 外勤记录表明，一支标准手电足以迫使它保持距离；但它的耐心远超人类，会跟随目标数小时等待光源耗尽。',
        '在停电事件中，笑魇的目击率上升 400%。它被假设与 Level 2/3 的供电系统存在某种共生关系，但所有接近取证的尝试均以人员失踪告终。',
      ],
      sighting: '「我数过它的牙。它也在数我的。」——Level 2 回收录音，剩余内容无法辨认。',
    },
    aggroStinger: true,
  },
  arcwraith: {
    type: 'arcwraith', name: '电弧体', hp: 40, speed: 3.0, damage: 24, sight: 8, hearing: 2, jamsLight: true, color: '#9adfff', habitat: 'any',
    desc: '沿电缆沟游走的蓝色电弧，靠近时你的手电会失灵。',
    codex: {
      no: '未编号（Level 3 特有）', danger: '4 级（高威胁）', habitat: 'Level 3 电站电缆沟与配电区',
      behavior: '由电流构成的飘浮实体，靠近时释放电磁脉冲：手电瘫痪、电池快速漏电，然后趁黑发动攻击。',
      counter: '保持三米以上距离，别让它贴上来。手电被瘫痪时立刻后撤到灯光下，等脉冲过去再重新点亮。',
      lore: [
        '「电弧体」是 Level 3 的高智能独占实体之一，外观为一团持续放电的蓝色等离子体，移动路径与电缆沟的走向高度一致。',
        '它的电磁脉冲有效半径约三米，范围内的电子设备（手电、摄像机）会瞬间瘫痪。M.E.G. Base Gamma 的损失报告中，近半数与「灯突然灭了」有关。',
        '绝缘服可以提供对放电攻击的完全防护，但对电磁脉冲无效——它瘫痪的是设备，不是人。',
      ],
      sighting: '「灯灭的那两秒里，我看见它在我脸前。灯亮了，它在十米外。它在玩我。」——Gamma 基地外勤录音。',
    },
    aggroStinger: true,
  },
}
