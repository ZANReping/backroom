// 实体类型定义与 AI 状态机类型（游荡→调查→追击→攻击）
export type AIState = 'idle' | 'wander' | 'investigate' | 'chase' | 'attack' | 'stunned'

export interface EntityCodex {
  no: string // 档案编号
  danger: string // 危害等级
  habitat: string // 栖息地
  behavior: string // 行为（遇见 3 次解锁）
  counter: string // 应对方法（遇见 6 次解锁）
  lore: string[] // ≥3 段档案式描述（M.E.G. 口吻）
  sighting: string // 目击记录
}

export interface EntityDef {
  type: string
  name: string
  hp: number
  speed: number // 瓦片/秒
  damage: number
  sight: number // 视野（瓦片）
  hearing: number // 听觉半径
  passive?: boolean // 不被激怒不攻击
  noRetaliate?: boolean // 无危害：被攻击也绝不反击（Ferren；provoked 对其无效）
  stationary?: boolean
  hearsSprint?: boolean // 对跑步声敏感
  darkAmbusher?: boolean // 只在黑暗中逼近（光照下退却）
  lightLure?: boolean // 趋光：被手电光吸引
  drainsLight?: boolean // 近身快速耗电（死亡飞蛾扑灯）
  jamsLight?: boolean // 瘫痪手电（电弧体）
  grabs?: boolean // 攻击减速（团块）
  ambusher?: boolean // 埋伏：近身才现身（管道蠕虫）
  feignNeutral?: boolean // 假装中立，近身暴起（侍者）
  mirrorMove?: boolean // 镜像移动（镜中人）
  spawnsFakes?: boolean // 复制幻影（复印机幽灵）
  charger?: boolean // 直线冲撞（运输车）
  // ===== v23：Level 6–11 / Level 601 行为标记 =====
  friendly?: boolean // 友善：不攻击，且随身发光（引路者 Entity 35）
  beamAttack?: boolean // 远程光束（邻里守望·观察者：把活体化为细灰色粉尘）
  phases?: boolean // 可穿墙/穿岩（缠斗者：钻穿岩石或直接 no-clip）
  blind?: boolean // 失明，纯靠回声定位（迷彩爬行者）
  throws?: boolean // 投掷巨石（迷彩爬行者）
  lightAverse?: boolean // 惧光：被照射时退却（7 层之物）
  voiceLure?: boolean // 用熟悉的人脸/声音诱骗（残破者、模仿者）
  smokeShroud?: boolean // 自身生成浓密翻涌的烟雾遮蔽真身（残破者）
  huge?: number // 巨型体量缩放（>1 时渲染放大且不进窄道）
  scale?: number // 实例级体型缩放（<1 变小；L2 温顺死亡飞蛾 0.6，由 calm 生成标记带入）
  secondArms?: boolean // 胸甲内藏第二对带爪手臂（派对客）
  // ===== v33：Level 1 实体特性 =====
  lightHunter?: boolean // 趋光猎手：仅玩家手电亮时可索敌/追击；灯灭时退却（笑魇）
  intimidatable?: boolean // 可被「直视眼睛 + 制造噪声」威慑定身（猎犬）
  // ===== v41：Level 2 实体特性 =====
  hunts?: string[] // 实体对实体仇恨：主动猎杀附近的指定类型实体（尸鼠猎杀死亡飞蛾）；被玩家激怒时优先反击玩家
  // ===== v42：尸鼠（合并死亡鼠）特性 =====
  grudge?: boolean // 记仇：被动实体被激怒后持续仇恨，脱战 8 秒也不平息（死亡鼠的凶猛反击血统）
  // ===== v53：L3 高智能实体实例变体（chunk raw 标记经 instantiate 浅拷贝带入）=====
  l3face?: boolean // L3 无面灵：面部长出位置/数量错误的眼耳鼻口器官
  tool?: boolean // L3 无面灵：使用石器工具（伤害上调，手部建模持有石器）
  capybara?: boolean // L3 尸鼠：水豚形态（体型变大）
  // ===== v25：栖息地（生成位置过滤）=====
  // indoor=仅室内瓦片（m.outdoor=0）；outdoor=仅室外瓦片（m.outdoor=1，如小巷/街道/田野/海面）；
  // any（缺省）=随意。生成时无符合瓦片则降级 any 并计数告警。
  habitat?: 'indoor' | 'outdoor' | 'any'
  aquatic?: boolean // 水生：outdoor 栖息地额外接受水域瓦片（liquid≠0，如 L7 海面）
  color: string
  desc: string // 图鉴外形简述（初见解锁）
  codex: EntityCodex
  aggroStinger: boolean
}

export interface Entity {
  id: number
  def: EntityDef
  x: number
  y: number
  z: number // v13：脚底高度（米；上层实体=FLOOR_H，楼梯上为坡道高度）
  hp: number
  state: AIState
  targetX: number
  targetY: number
  stateT: number // 状态计时
  attackCd: number
  stunT: number
  facing: number
  lungeT: number // 攻击前摇动画
  dead: boolean
  deathT: number // 死亡动画剩余时间
  animT: number // 步态相位
  hidden?: boolean // 埋伏中（管道蠕虫）
  screamed?: boolean // 久坐者
  activated?: boolean // 人制品售货机：已被激活（背对触发，长出骷髅手腿追击玩家）
  webX?: number // Nguithr'xurh：陷阱（结囊）位置 x/y
  webY?: number
  disguised?: string // 窃皮者伪装成的物品类型
  fakeT?: number // 复印机幽灵幻影计时
  scrapeT?: number // 穿墙沙沙声计时（钝人）
  intimidated?: boolean // 猎犬：正处于「直视+噪音」威慑中（播报去抖）
  provoked?: boolean // 被动实体（无面灵）：被玩家攻击后激怒，持续反击直到脱战平息
  targetEnt?: Entity // 实体对实体仇恨目标（被其他实体攻击后反击伤害者——死亡飞蛾反击尸鼠）
  encountered?: boolean // v54：图鉴遭遇已计数（按个体去重——看见/索敌/攻击命中/特殊交互，每只只计一次）
  blackoutSpawn?: boolean // 停电期间生成（笑魇）：灯光恢复时消散
}
