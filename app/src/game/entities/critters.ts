// 实体定义（设定依据 Backrooms Wikidot / Fandom 官方条目，M.E.G. 档案风格）
import type { EntityDef } from './types'

// 兽形/载具/虫形实体（猎犬/团块/死亡飞蛾/运输车/管道蠕虫）
export const CRITTER_ENTITIES: Record<string, EntityDef> = {
  hound: {
    type: 'hound', name: '猎犬', hp: 35, speed: 3.4, damage: 18, sight: 6, hearing: 12, hearsSprint: true, color: '#7e6c58',
    desc: '四肢着地的人形掠食者，听觉极其灵敏，速度全实体中最快。',
    codex: {
      no: 'Entity 8「Hound」', danger: '4 级（高威胁）', habitat: 'Level 1 / Level 4 / Level 5 / Level 9 / Level 11 等多个层级',
      behavior: '视力平平，但听觉半径极大，对奔跑脚步声尤其敏感——冲刺会把半个楼层外的它引来。',
      counter: '在它附近慢走，不要冲刺。若已被发现，利用转角甩开视线，它主要靠声音重新锁定你。',
      lore: [
        '「猎犬」指一类四肢着地、骨骼结构明显异于人类的人形掠食者。其颈椎可以 180 度旋转，奔跑时关节发出湿响。',
        '它的内耳结构异常发达。实验记录显示，它对 12 米外的奔跑声的反应时间不足一秒，但对同距离慢速拖行声几乎无反应。',
        '猎犬有群体狩猎行为。Level 1 的停电事件中，它们是造成伤亡最多的实体。M.E.G. 建议：「在后室里，安静就是护甲。」',
      ],
      sighting: '「我屏住呼吸贴墙挪了六分钟。它从我面前爬过去三次，没发现我。」——Level 1 幸存者访谈。',
    },
    aggroStinger: true,
  },
  clump: {
    type: 'clump', name: '团块', hp: 60, speed: 0.9, damage: 20, sight: 4, hearing: 6, grabs: true, color: '#5a4638',
    desc: '由腐烂肢体纠缠而成的缓慢肉块，常堵在走廊中央。臂展远超目测。',
    codex: {
      no: 'Entity 5「Clump」', danger: '3 级（中威胁）', habitat: 'Level 2 / Level 3 的狭窄走廊 · Level 8',
      behavior: '移动极慢，但倾向于堵在通道正中。抓住你时会将你拖住减速，臂展接近两米。',
      counter: '绕行或把它引开——弄出声响让它离开门口再溜过去。被抓后体力会瞬间耗尽，别硬闯。',
      lore: [
        '团块是一个由数十条人类肢体融合而成的聚合实体。X 光透视显示其内部没有骨架，肢体之间以未知方式共享神经信号。',
        '它的「堵门」行为被推测为捕猎策略：狭窄通道中，缓慢不再是弱点。多名流浪者报告被其伸出的手臂拖住脚踝，靠同伴拖拽才得以脱身。',
        '团块会持续发出类似多人呓语的声音。M.E.G. 语言学家在其中识别出过完整的求救短句，这一发现至今没有解释。',
      ],
      sighting: '「走廊尽头那团东西在动。我绕道走了二十分钟，值得。」——Level 3 勘探笔记。',
    },
    aggroStinger: true,
  },
  deathmoth: {
    type: 'deathmoth', name: '死亡飞蛾', hp: 15, speed: 3.2, damage: 8, sight: 5, hearing: 2, lightLure: true, drainsLight: true, color: '#8a7a5a',
    desc: '趋光的巨型蛾群，翼展接近半米。你的手电光对它们而言就是邀请函。',
    codex: {
      no: 'Entity 4「Deathmoths」', danger: '2 级（低威胁，集群时升 4 级）', habitat: 'Level 5 恐怖酒店（主巢）、Level 1、Level 8、Level 9',
      behavior: '被任何光源吸引，包括你的手电。扑到光上时会疯狂抓挠，快速消耗电池并遮挡视线。',
      counter: '关掉手电绕行——它们在黑暗中几乎看不见你。或用手电把它们引到反方向再关灯离开。',
      lore: [
        '死亡飞蛾是后室中体型最大的节肢类实体之一，翼展可达 45 厘米。其翅膀粉尘吸入后会引起定向障碍与幻觉。',
        '它的趋光性极端到自毁的程度：会扑向任何光源直至电池耗尽或自身死亡。Level 5 的灯具周围常年堆积着蛾尸，但酒店会「自我清洁」，尸骸总在几分钟内消失。',
        'M.E.G. 外勤手册特别注明：「在 Level 5，手电不是照明工具，是蛾群的晚餐铃。请改用荧光棒与记忆导航。」',
      ],
      sighting: '「它们扑在我灯罩上，翅膀把光全挡住了。我在黑暗里听见更多翅膀声。」——Level 5 录音。',
    },
    aggroStinger: true,
  },
  carrier: {
    type: 'carrier', name: '运输车', hp: 90, speed: 2.0, damage: 30, sight: 9, hearing: 2, charger: true, color: '#d9c39a',
    desc: '在车道上巡逻的无人运输车，车灯是它唯一的眼睛。',
    codex: {
      no: '未编号（Level 1 特有）', danger: '4 级（高威胁）', habitat: 'Level 1 停车场车道',
      behavior: '沿直线巡逻，发现目标后鸣笛并全速直线冲撞，无法急转弯。',
      counter: '听到鸣笛立刻横向往柱后躲——它刹不住也转不过弯。绕到它身后就是安全的。',
      lore: [
        '该车与 Level 1 中其他故障车辆不同：引擎持续运转，车身合金（代号「tripse」）强度远超已知材料，无法被常规武器损伤。',
        '它的行为模式类似自动巡逻机械：固定路线、固定速度，遭遇障碍物（包括流浪者）时执行冲撞而非避让。',
        'M.E.G. 曾尝试拦截一台以研究其动力来源，损失两名外勤后项目终止。现行条例：「听见喇叭，找柱子。」',
      ],
      sighting: '「它没有司机。我趴在车底看了十分钟，驾驶座是空的，方向盘在自己转。」——Level 1 流浪者。',
    },
    aggroStinger: true,
  },
  pipeworm: {
    type: 'pipeworm', name: '管道蠕虫', hp: 45, speed: 2.8, damage: 20, sight: 5, hearing: 8, ambusher: true, color: '#7a4a2e',
    desc: '从管道里破墙而出的蠕虫。压力表剧烈抖动时，快跑。',
    codex: {
      no: '未编号（Level 2 特有）', danger: '4 级（高威胁）', habitat: 'Level 2 管道走廊',
      behavior: '潜伏在管道网络中，只在猎物靠近时破墙而出；附近压力表会提前剧烈抖动。',
      counter: '看到疯狂抖动的压力表就放慢脚步准备后撤；它破土后的前两三秒最危险，拉开距离后它反而笨拙。',
      lore: [
        '该实体疑似 Fandom 档案中「生物管道」的幼体：伪装成普通管线的一部分，体长估计在 20 米以上，露出的只是捕食端。',
        '破土前的征兆非常稳定：附近管道的震动频率会骤增，压力表指针打颤。经验丰富的流浪者靠「读表」躲开了绝大多数袭击。',
        '解剖是不可能的——它的身体始终有一部分留在墙内。被斩断的捕食端会在数小时内「缩回去」，墙面随后自行闭合。',
      ],
      sighting: '「表针跳了三下，我就趴下了。它从我头顶穿过去，咬走了我的背包。」——Level 2 幸存者。',
    },
    aggroStinger: true,
  },
}
