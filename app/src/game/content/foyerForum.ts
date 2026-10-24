// 前厅：卧室电脑上的本地论坛（虚构中性品牌「边界线 / borderline」，版块前缀 b/，用户前缀 u/）。
// 版式参照常见社区论坛（顶栏搜索 + 左侧导航 + 版块横幅 + 帖子卡片投票 + 嵌套评论树 + 右侧版块简介/版规），
// 名称、图标、配色均为自拟，不使用任何真实网站的名称或标志。剧情沿用 docs.ts foyer_forum 的传闻帖。

export interface ForumComment {
  id: string
  user: string
  op?: boolean // 楼主
  mod?: boolean
  time: string
  score: number
  body: string[]
  deleted?: boolean
  collapsed?: boolean // 默认折叠
  replies?: ForumComment[]
}

export interface ForumPost {
  id: string
  board: string
  user: string
  time: string
  title: string
  flair?: { text: string; color: string }
  pinned?: boolean
  mod?: boolean
  score: number
  comments: number
  body: string[]
  /** 卡片配图：程序化绘制的类型（不加载外部图片）。 */
  image?: 'cctv' | 'poster' | 'alley'
  thread?: ForumComment[]
}

export const FORUM_SITE = { name: 'borderline', zh: '边界线', host: 'borderline-forum.example' }

export const FORUM_BOARD = {
  id: 'legends',
  name: 'b/都市传说',
  title: '都市传说 · 本地版',
  members: '18.6k',
  online: '214',
  created: '2019 年 3 月 2 日',
  about: '本地的怪谈、传闻与“我朋友的朋友遇到过”。欢迎考据，欢迎反驳；请勿组织任何线下“探险”。',
  rules: [
    { t: '不要组织线下探险', d: '讨论传闻可以，约人去废楼、后巷、地下通道一律删帖封号。' },
    { t: '不要发布失联者的隐私', d: '寻人信息请转发家属公开的版本，不要扒住址和社交账号。' },
    { t: '考据请附来源', d: '新闻链接、照片、时间地点。只有“听说”的请加【传闻】标签。' },
    { t: '禁止人身攻击', d: '可以不信，不可以骂人。' },
    { t: '标题写清楚', d: '“救命”“速看”之类的标题会被折叠。' },
  ],
  mods: ['u/lamplight', 'u/archive_rat', 'u/版务机器人'],
}

export const FORUM_SIDEBAR_BOARDS = [
  { name: 'b/都市传说', color: '#e8b93c', active: true },
  { name: 'b/夜班日记', color: '#6c8cd5' },
  { name: 'b/本地生活', color: '#58a66b' },
  { name: 'b/失物招领', color: '#d06b5a' },
  { name: 'b/旧城考古', color: '#9a7ad0' },
]

/** 主帖（剧情核心）：1L/2L 为楼主正文；评论树沿用原帖的 57L / 213L。 */
const MAIN_THREAD: ForumComment[] = [
  { id: 'c1', user: '匿名用户', time: '1 小时前', score: 312, body: ['又是这种帖子。去年也有人说某个地铁站能卡进去，结果呢？'], replies: [
    { id: 'c1a', user: 'noclip_0', op: true, time: '58 分钟前', score: 187, body: ['地铁站那个是编的。这个不一样，新闻都出来了，七个人。'], replies: [
      { id: 'c1a1', user: '夜班店员', time: '41 分钟前', score: 264, body: ['我在第六大街那家 24 小时便利店上夜班。那天晚上监控真的只剩一片泛黄的雪花，过了十几秒才恢复。', '警察来调过录像，什么都没调到。'], replies: [
        { id: 'c1a1a', user: '匿名用户', time: '38 分钟前', score: 41, body: ['……行吧，这个有点吓人。'] },
      ] },
    ] },
    { id: 'c1b', user: 'lamplight', mod: true, time: '50 分钟前', score: 96, body: ['提醒一下版规第一条。讨论可以，别约人去。'] },
  ] },
  { id: 'c2', user: 'archive_rat', time: '45 分钟前', score: 154, body: ['“六盘录像带 → Level 11 档案馆”这个说法我在另一个帖子里也见过，细节对得上：都说出口不是门，是“档案”。'], replies: [
    { id: 'c2a', user: 'noclip_0', op: true, time: '40 分钟前', score: 72, body: ['对，就是那个说法。她出来以后什么都不肯多说，只反复讲“六盘”。'] },
    { id: 'c2b', user: '', deleted: true, time: '39 分钟前', score: 0, body: ['[该评论已删除]'] },
  ] },
  { id: 'c3', user: 'cassette_six', time: '12 分钟前', score: 98, body: ['我今晚就去。如果明天我没回帖，你们就知道是真的了。'], replies: [
    { id: 'c3a', user: 'lamplight', mod: true, time: '10 分钟前', score: 77, body: ['别去。真的。'] },
    { id: 'c3b', user: '匿名用户', time: '9 分钟前', score: 33, body: ['记得带充电宝 lol'], replies: [
      { id: 'c3b1', user: 'cassette_six', time: '8 分钟前', score: 25, body: ['带了。手电、水、能量棒，手机充满了。'] },
    ] },
  ] },
  { id: 'c4', user: 'rain_on_6th', time: '30 分钟前', score: 12, collapsed: true, body: ['楼上那条巷子我白天路过过，墙角确实有一块颜色不一样，像是新刷的漆……'] },
]

export const FORUM_POSTS: ForumPost[] = [
  { id: 'p0', board: 'b/都市传说', user: '版务机器人', mod: true, pinned: true, time: '3 个月前', score: 402, comments: 18,
    flair: { text: '公告', color: '#3b7a57' },
    title: '【版规】讨论传闻请勿组织线下探险（必读）',
    body: ['本版只讨论，不组织。任何约人去后巷、废楼、地下通道的帖子会被直接删除。', '如果你或你认识的人失联了，请先报警，再联系家属。'] },
  { id: 'p1', board: 'b/都市传说', user: 'noclip_0', time: '2 小时前', score: 1428, comments: 214,
    flair: { text: '整理', color: '#c9822b' },
    title: '【整理】旧仓路后巷到底是什么（附“出来”的方法）',
    body: [
      '新闻里那七个人我认识其中一个的朋友。说一下我知道的：旧仓路那条没名字的后巷，墙角有一块颜色不对的地方。午夜前后贴着墙走，会“卡”进去——像游戏里穿模一样。',
      '进去以后是一片无边无际的黄色房间，荧光灯一直在嗡嗡响。圈子里叫它“后室”，那一层叫 Level 0。',
      '重点来了：有人出来过。她说出口不是门，是“档案”。你要在里面找到六盘录像带，带到一座叫 Level 11 的城市，交给那里的公共档案馆。档案馆收齐六盘，门才会开。',
      '所以如果你真要去：带手电、带水、带吃的、手机充满电。别一个人去。——我知道你们不会听。',
    ],
    image: 'alley', thread: MAIN_THREAD },
  { id: 'p2', board: 'b/都市传说', user: '夜班店员', time: '5 小时前', score: 563, comments: 87,
    flair: { text: '亲历', color: '#6c5bb5' },
    title: '第六大街那家 24 小时便利店的监控，那一刻只录到黄色雪花',
    body: ['不是剪辑，是店里的监控主机原样导出的。23:58，四个画面同时变成这样，持续了 14 秒。', '那之后店门口的寻人启事就多了一张。'],
    image: 'cctv', thread: [
      { id: 'q1', user: 'rain_on_6th', time: '4 小时前', score: 58, body: ['雪花是偏黄的，这个太怪了。一般坏信号是灰白的。'] },
      { id: 'q2', user: '匿名用户', time: '4 小时前', score: 21, body: ['电压不稳吧，老城区经常跳闸。'], replies: [
        { id: 'q2a', user: '夜班店员', time: '3 小时前', score: 30, body: ['那天店里的灯一直亮着。'] },
      ] },
    ] },
  { id: 'p3', board: 'b/都市传说', user: 'lostcat_42', time: '9 小时前', score: 911, comments: 132,
    flair: { text: '寻人', color: '#b8454a' },
    title: '扩散：10 月 14 日晚 23 点后在第六大街附近失联的女生（家属公开版本）',
    body: ['家属授权转发，照片和联系方式请看公交站和楼道里贴的启事。', '最后定位在旧仓路一带。请不要自己去巷子里找。'],
    image: 'poster', thread: [
      { id: 'r1', user: 'lamplight', mod: true, time: '8 小时前', score: 120, body: ['已置顶到本地生活版。请大家只转发家属公开的信息。'] },
    ] },
  { id: 'p4', board: 'b/都市传说', user: 'skeptic_nightly', time: '1 天前', score: 77, comments: 46,
    flair: { text: '讨论', color: '#4a7fb5' },
    title: '去年说某个地铁站能“卡进去”的那位，后来怎么样了？',
    body: ['想听听当时在场的人怎么说。我的看法是：每次有失联新闻，这种帖子就会冒出来。'],
    thread: [
      { id: 's1', user: 'archive_rat', time: '1 天前', score: 19, body: ['那位后来自己删号了。我存了截图，但没有任何实锤。'] },
    ] },
]
