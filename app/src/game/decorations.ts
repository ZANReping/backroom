// 装饰物（可查看的 lore 结构）内容注册表：涂鸦 / 刻痕 / 路标 / 金属字母等
// 纯氛围交互——查看后播一段文案、微调理智，无游戏性后果。
// 本文件是纯数据模块：交互分派与文案播报流程在 engine.ts（scanInteract / doInteract）。
// 注意分工：renderer/decorations.ts 是另一套「纯渲染氛围装饰」（地面/墙面贴花与低模道具），
// 那里的内容不进 m.structures、不可交互；本文件的装饰物是 m.structures 里 solid=false 的可查看结构。
export interface DecorViewDef {
  label: string // scanInteract 交互提示
  sanity: number // 理智变化（正=恢复 / 负=打击，钳制逻辑在 engine）
  msgs?: { text: string; type: 'loot' | 'lore' | 'system' }[] // 固定文案（按序播报；随机文案见下方各表）
}

export const DECOR_VIEWS: Record<string, DecorViewDef> = {
  graffiti:    { label: '查看 涂鸦',                 sanity: +2 }, // 文案见 GRAFFITI_LORE_KIND / GRAFFITI_LORE
  braille:     { label: '摸读 墙上的刻痕',           sanity: +4 }, // 文案见 BRAILLE_MARKS
  roadsign:    { label: '查看 路标',                 sanity: 0,  msgs: [
    { text: '路标上有 M.E.G. 的标志，还有一个箭头。', type: 'lore' },
    { text: '你记下了方向——出口的位置标在了地图上。', type: 'loot' }, // 仅在出口揭示成功时播报（engine 判定）
  ] },
  endletters:  { label: '走近 金属字母',             sanity: -6, msgs: [
    { text: '金属字母底下积了一层灰：the end is near。', type: 'lore' },
    { text: '落款没有日期。你数了数字母之间的间距——它们是均匀的，均匀得像印刷。', type: 'system' },
  ] },
  clipfuse:    { label: '查看 卡在一起的两栋房子',   sanity: -10, msgs: [
    { text: '一间卧室的墙，从另一间的餐桌中央穿了出来。两栋房子都完好，只是它们同时占着这一块地方。', type: 'lore' },
  ] },
  handspike:   { label: '触摸 石头做的手',           sanity: -8, msgs: [
    { text: '石头做的手。指节分明，掌纹清晰——上面有指纹，而且和你见过的任何一枚都不一样。', type: 'lore' },
    { text: '化学检测证实它纯属天然矿物，没有任何人工雕刻的证据。', type: 'system' },
  ] },
  windowblack: { label: '查看 涂黑的窗户',           sanity: +1, msgs: [
    { text: '窗户被从里面涂死了。档案说：涂黑的是安全的，没涂黑的才是陷阱。', type: 'lore' },
  ] },
  glasswin:    { label: '眺望 窗外',                 sanity: +1 }, // 文案见 GLASSWIN_TEXT（按层级二选一）
}

// v17：变体房间专属 lore（涂鸦/文档，按结构 data.loreKind；同处再读顺延下一条）
export const GRAFFITI_LORE_KIND: Record<string, string[]> = {
  arch: [
    '墙上刻着：「拱门房的拱门从不动。档案说这里是全层最稳定的地方——可以喘息，但别过夜。」',
    '「穿过第七个拱门时别回头。它们喜欢数拱门。」',
  ],
  pillarhall: [
    '「柱子比昨天多了两根。别数。数了就会一直数下去。」',
    'M.E.G. 标记：「柱厅——视线受阻，记路用喷漆，别用声音。」',
  ],
  pit: [
    '坑边的刻字：「别往下看太久。坑底也在看你。」',
    '「坑是方的。所有天然的东西都不是方的。」',
  ],
  blackout: [
    '「停电区的灯不是坏了——是被『关掉』的。开着手电，别停。」',
    '「黑暗里没有东西。官方说的。你信官方吗？」',
  ],
  manila: [
    '一份泛黄的文档：「马尼拉室——给还能读到这句话的人。床是干净的，水在柜子里。别把这里的事告诉墙纸。」',
    '文档第二页：「……在这里睡了一晚，嗡鸣声远了。如果你找到那面闪烁的墙，别犹豫。——K.」',
  ],
  red: [
    '「红房间里待太久的人，出来时都不说话。」',
    '「红色不是灯光的颜色，是这里『空气』的颜色。数到十，离开。」',
  ],
  exitguide: [
    '涂鸦箭头指向一侧：「闪烁的墙在这边——跟着电流声。」',
    '「门在闪。灯闪三下停一下的就是真的，别信常亮的。」',
  ],
}

// 通用涂鸦文案（无 loreKind 时随机一条）
export const GRAFFITI_LORE: string[] = [
  '墙上写着：「别停下。它们在听。」',
  '潦草的字迹：「磁带……集齐六盘……门就会开。」',
  '有人刻下：「 Level 5 的旋转门是唯一的出路。」',
  '「黑暗里别关灯。不，还是关上吧。」——逻辑已无法辨认。',
  '「如果你看到另一个你，跑。」',
  '「无面的人不记得自己是谁。别提醒他们。」',
  'M.E.G. 告示：「不要喝地毯里的水，无论它看起来多像杏仁水。」',
  '「停电区里没有灯，但灯里有东西。」',
  '「电梯按钮有 382 层。别按 13 层以上的。」',
  '「红房间里待太久的人，出来时都不说话。」',
]

// 墙上的刻痕（摸读随机一条）
export const BRAILLE_MARKS: string[] = ['「往回走」', '「这边死路」', '「第 3 次经过这里」', '「别应声」']

// 窗外景色（按层级二选一）
export const GLASSWIN_TEXT = {
  l4: '玻璃外是雾。楼群的剪影在灰白里沉浮，像沉船的桅杆。没有一条路通向那里。',
  other: '窗外是凝固的夜景：霓虹在远处明灭，街道上空无一人。玻璃纹丝不动。',
}
