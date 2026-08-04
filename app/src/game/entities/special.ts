// 实体定义（设定依据 Backrooms Wikidot / Fandom 官方条目，M.E.G. 档案风格）
import type { EntityDef } from './types'

// 黑暗/能量特殊实体（笑魇/电弧体）
export const SPECIAL_ENTITIES: Record<string, EntityDef> = {
  smiler: {
    type: 'smiler', name: '笑魇', hp: 40, speed: 2.4, damage: 22, sight: 7, hearing: 4, lightHunter: true, color: '#e8e8e0', habitat: 'any',
    desc: '黑暗中浮现的反光笑脸与齿列，身形近乎不可见。停电时倾巢而出。',
    codex: {
      no: 'Entity 3「Smilers」', danger: '4 级（高威胁）', habitat: 'Level 1 停电区 / Level 2 / Level 3 的无光角落 · Level 8 Handyland',
      behavior: '在层级灯光熄灭时生成。具有趋光性——会被你的手电光吸引并径直扑来；关掉手电，它便失去目标、不再靠近。灯光恢复的瞬间，它退回黑暗。',
      counter: '停电时关掉手电、摸黑绕行，它不会接近无光的目标；若已被盯上，照亮它并拉开距离，或熄灭光源趁其迷失时脱身。',
      lore: [
        '「笑魇」是后室中最广为人知的敌对实体之一。它没有可见的躯干——目击报告一致描述为「黑暗中悬浮的一排牙齿和两只反光的眼睛」。',
        '该实体表现出强烈的趋光性：它会扑向任何移动的光源。Level 1「闪烁」停电期间，笑魇目击率上升 400%，灯光恢复后所有个体同时消失，去向不明。',
        'M.E.G. 外勤记录相互矛盾的一点在于：幸存者清一色是「当时关了灯」的人。它被假设与层级供电系统存在某种共生关系，但所有接近取证的尝试均以人员失踪告终。',
      ],
      sighting: '「我把手电关了，贴着墙走。那排牙从我面前飘过去，奔着别人的光去了。」——Level 1 幸存者访谈。',
    },
    aggroStinger: true,
  },
  arms: {
    type: 'arms', name: '手臂', hp: 30, speed: 0, damage: 16, sight: 0, hearing: 0, stationary: true, color: '#c9a684', habitat: 'indoor',
    desc: '自天花板通风管内垂下的苍白长臂，指节反曲。层级灯光熄灭时，它会伸下来猎捕。',
    codex: {
      no: '未编号（Level 1 特有）', danger: '3 级（中威胁）', habitat: 'Level 1 的天花板通风管道',
      behavior: '平时蜷缩在通风管深处，无法观测。层级灯光熄灭时从管内垂下，在管道下方挥抓任何经过的活物；灯光恢复后立即缩回。',
      counter: '停电时远离通风管下方，绕开管道投影区域。它可以被武器击中——但更值得做的是退进维护通廊的灯火里等停电结束。',
      lore: [
        'Level 1 部分天花板的通风管道在停电期间会「长出」手臂：苍白、关节反曲、长度远超管内容积所能容纳。没有目击者见过手臂的本体。',
        '对通风管的拆解只找到空的管道与少量人类皮屑。M.E.G. 推测管道连接着某个不属于 Level 1 的空间，或者手臂本身就是管道的一部分。',
        '被抓伤的流浪者描述伤口「像被很多只手轮流拧过」。所有伤口均出现在灯光熄灭后的 40 秒内。',
      ],
      sighting: '「灯灭的时候我正好站在通风口下面。我现在只剩下九根手指。」——Level 1 回收录音。',
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
