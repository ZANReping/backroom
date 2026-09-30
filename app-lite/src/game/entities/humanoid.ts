// 实体定义（设定依据 Backrooms Wikidot / Fandom 官方条目，M.E.G. 档案风格）
import type { EntityDef } from './types'

// 人形/类人实体（钝人/窃皮者/无面灵/复印机幽灵/久坐者/侍者/镜中人）
export const HUMANOID_ENTITIES: Record<string, EntityDef> = {
  duller: {
    type: 'duller', name: '钝人', hp: 70, speed: 1.3, damage: 15, sight: 6, hearing: 5, phases: true, hunts: ['dryshrimp'], color: '#2f2f36', habitat: 'indoor',
    desc: '约两米高的深灰人形，接近黑但仍能分辨。没有面部，也没有耳朵。手臂长得不成比例，还能继续伸长。站姿摇晃，走法不像人。',
    codex: {
      no: 'Entity 6「Dullers」', danger: '3 级（中威胁）', habitat: 'Level 1 / Level 4',
      behavior: '缓慢但永不停歇地追踪目标，能够径直穿过墙壁——它行动时会产生刺耳的沙沙声，隔着墙也能听见。手臂能伸展到很远的距离，手持两倍自身体重的物品时仍能高速奔跑。',
      counter: '不要与它缠斗，也别指望墙壁能挡住它——听声辨位，朝沙沙声的反方向撤离。它畏惧杏仁水：泼出去或砸碎一瓶，通常能让它退开。',
      lore: [
        '外形为高大、深灰的人形，皮肤颜色接近黑色但仍可分辨；骨架脆弱，缺失若干显著特征——没有脸，也没有耳朵。',
        '皮肤深色多皱，局部撕裂或呈「煮烂」状，露出下面紫红色的肉。那层紫色肌肉具有超自然性质，它的速度与力量都来自那里。',
        '常见突变包括：多出一个躯干、肥胖体型、头部拉长、多出一条手臂。另有部分个体呈现为「由浓稠灰色液体构成的人形」。',
      ],
      sighting: '「它跟了我四十分钟。我停下来吃罐头，它也停下来，站在三米外。然后它的手伸过来了，人还在原地。」',
    },
    aggroStinger: true,
  },
  skinstealer: {
    type: 'skinstealer', name: '窃皮者', hp: 55, speed: 2.6, damage: 25, sight: 7, hearing: 5, color: '#c2b478', habitat: 'indoor',
    desc: '真身是高大的苍黄色人形，眼窝深凹、眼球纯白。体表布满微观凸起，像章鱼触手上的吸盘。它的血是半透明的。',
    codex: {
      no: 'Entity 10「Skin-Stealer」', danger: '4 级（高威胁）', habitat: '主要分布于前三层 · Level 2 / Level 5',
      behavior: '静止伪装成一件不起眼的补给品（绷带、罐头），等你靠近到拾取距离才现出原形暴起攻击。Level 3 的个体更进一步：伪装成流浪者的模样径直走向你，近身才剥皮暴起。',
      counter: '观察不自然的物品：位置突兀、方向不对、与周围环境格格不入的补给很可能是它。绕开，或先远远扔出声响引它现形。',
      lore: [
        '窃皮者的本体被描述为「由筋膜与增生组织构成的高大人形」。它会剥下受害者的皮肤披在身上，在一段时间内维持近似人类的外形——直到皮肤腐烂脱落。',
        '更近的档案更新表明，该实体拥有变形拟态能力，能将体态压缩成日常物品的尺寸。Level 5 前哨站「Housekeeping」要求成员对任何「单独出现的补给」执行三点确认程序。',
        '它的智力足以理解「诱饵」的概念。M.E.G. 多次发现它将真补给摆在显眼处，自己伪装成旁边那件。搜寻补给时请永远先怀疑第二件。',
      ],
      sighting: '「桌上的绷带昨天不在那儿。我拍照对比过。别碰它。」——Level 5 房客遗留字条。',
    },
    aggroStinger: true,
  },
  faceling: {
    type: 'faceling', name: '无面灵', hp: 50, speed: 1.0, damage: 10, sight: 5, hearing: 3, passive: true, color: '#d6c9a0', habitat: 'indoor',
    desc: '与人类高度相似的人形，头发完好，唯独整张脸是一片光滑的空白——没有眼、没有鼻、没有嘴。它们没有眼睛，却「像看得见一样」地移动。',
    codex: {
      no: 'Entity 9「Facelings」', danger: '1 级（中立，激怒后 3 级）', habitat: 'Level 0 / Level 1 / Level 11（数量最多）',
      behavior: '漫无目的地游荡，无视你的一切行为——除非你攻击它或贴身冲撞。激怒后穷追不舍。Level 3 的无面灵对流浪者抱有敌意：部分个体使用石器工具，面部会长出类似眼、耳、鼻、口的器官——但位置和数量通常不对。',
      counter: '不要触碰、不要攻击、保持一米以上距离。它不记得仇恨，拉开距离一段时间后会重新平静下来。',
      lore: [
        '无面灵是后室中数量最多的实体，外形为没有面部特征的人形。它们多数时间表现出类似「梦游者」的行为模式，对流浪者完全无视。',
        '攻击无面灵是被反复验证过的错误决定：被激怒的个体表现出与其迟缓外表不符的暴力，且仇恨会持续整个遭遇过程。',
        '部分个体似乎保留着生前的习惯性动作——敲键盘、拖地、等电梯。M.E.G. 心理部门建议流浪者不要对此类行为做出回应：「别提醒它们。」',
      ],
      sighting: '「它站在饮水机前面排队。我也排了。我们都活下来了。」——Level 4 轶闻记录。',
    },
    aggroStinger: false,
  },
  copierwraith: {
    type: 'copierwraith', name: '复印机幽灵', hp: 45, speed: 2.2, damage: 16, sight: 7, hearing: 5, spawnsFakes: true, color: '#7fb0c9', habitat: 'indoor',
    desc: '半透明的人形残影，会复制出你的幻影来迷惑你。',
    codex: {
      no: '未编号「Copier Wraith」', danger: '3 级（中威胁）', habitat: 'Level 4 废弃办公室',
      behavior: '接近你时会在周围生成数个与你身形相似的半透明幻影，混淆你的方向感，本体趁机接近。',
      counter: '幻影静止不动且半透明发蓝光——盯住最先动的那个，那就是本体。别被数量吓住，幻影没有伤害。',
      lore: [
        '该实体首次被发现于一台仍在自动复印的复印机旁，纸张上印满模糊的人脸。官方仅确认 Level 4 存在猎犬与钝人，本条为未证实目击汇编。',
        '它生成幻影的机制不明，但幻影与本体有一个稳定的区别：幻影从不主动移动。多名流浪者凭此规律脱险。',
        '那台复印机至今仍在工作。耗材来源不明。M.E.G. 已禁止一切人员按下「复印」键。',
      ],
      sighting: '「六个我围成一圈看我。只有一个在往前走。」——Level 4 流浪者，事后接受心理评估。',
    },
    aggroStinger: true,
  },
  seated: {
    type: 'seated', name: '久坐者', hp: 60, speed: 0, damage: 12, sight: 6, hearing: 0, stationary: true, color: '#8f8a7c', habitat: 'indoor',
    desc: '坐在工位上一动不动的人影。看到你会尖叫，引来其他东西。',
    codex: {
      no: '未编号「Seated」', danger: '3 级（警报源）', habitat: 'Level 4 隔间区',
      behavior: '无法移动。一旦看见你就会发出全层可闻的尖叫，大幅削减你的理智并把附近所有实体引到你的位置。',
      counter: '远远发现就绕行；来不及的话优先击杀——它的叫声只发一次。被尖叫后立刻转移位置，别留在原地。',
      lore: [
        '它坐在办公椅上，姿势标准得像在上班。腐坏程度显示它至少坐了二十年，但肌肉没有萎缩迹象。',
        '它的尖叫声压超过 130 分贝，且带有一种「定向的悲伤」——听到的流浪者会瞬间丧失部分理智，听到的实体会进入觅食状态。',
        '本条为未证实目击汇编。官方档案中 Level 4 不应存在此类实体。但每个去过 Level 4 的流浪者都知道那个工位。',
      ],
      sighting: '「它叫的那一声，全楼层的灯都闪了。然后我听见四面八方都是脚步声。」——Level 4 录音。',
    },
    aggroStinger: false,
  },
  bellhop: {
    type: 'bellhop', name: '侍者', hp: 70, speed: 2.5, damage: 26, sight: 8, hearing: 6, feignNeutral: true, color: '#b08d46', habitat: 'indoor',
    desc: '提着行李车的侍者，制服笔挺。它微笑着……直到它不笑了。',
    codex: {
      no: '未编号「Bellhop」', danger: '4 级（高威胁）', habitat: 'Level 5 恐怖酒店主厅与客房走廊',
      behavior: '远距离时表现得温顺无害，甚至会对你「点头致意」；一旦你放松警惕靠近，它会瞬间暴起，速度极快。',
      counter: '永远不要主动接近它，保持四米以上。它「微笑」的阶段就是给你离开的时间——用它走开，而不是打招呼。',
      lore: [
        '该实体身着 1930 年代酒店行李员制服，推着一辆行李车。行李车上从未见过行李。',
        '它的行为分为两个阶段：「服务阶段」中它缓慢游荡、动作恭敬；「接待阶段」在目标进入两米左右时触发，面部肌肉会以不可能的方式展开。',
        '它疑似不属于 Level 5 的「The Originals」社群——Originals 成员警告过流浪者：「别让他帮你拿包。」',
      ],
      sighting: '「他朝我鞠了一躬。我回了一躬。我错了。」——Level 5 房客，失去左臂。',
    },
    aggroStinger: true,
  },
  mirrorself: {
    type: 'mirrorself', name: '镜中人', hp: 50, speed: 2.4, damage: 20, sight: 8, hearing: 3, mirrorMove: true, color: '#e8d8c8', habitat: 'indoor',
    desc: '镜子里走出来的「你」，动作与你完全镜像。',
    codex: {
      no: '未编号「Mirror Self」', danger: '4 级（高威胁）', habitat: 'Level 5 客房镜子附近',
      behavior: '以你为中心做镜像移动：你进它退、你退它进，始终保持与你对称。你试图绕开它时，它恰恰封住你的路。',
      counter: '反直觉应对：直接朝它冲过去，它会被迫后退让路；或者原地不动，等它自己失去兴趣。别试图绕——绕等于被堵。',
      lore: [
        '该实体的外形与遭遇者完全一致，但所有动作严格镜像。它被认为与 Level 5 主厅「会盯着人的墙纸与画像」同源。',
        '镜像移动没有延迟——物理上不可能的同步精度。M.E.G. 研究组怀疑它「不是复制你的动作，而是你在复制它」。该方向的研究已被叫停。',
        '它会攻击任何试图打碎镜子的人。镜面破碎后，它仍然存在。',
      ],
      sighting: '「我抬手，它也抬手。我跑了，回头看见它也背对着我在跑。我们在远离彼此，这居然让我哭了。」——Level 5 房客日记。',
    },
    aggroStinger: true,
  },
}
