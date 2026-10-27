// 实体类型定义与 AI 状态机类型（游荡→调查→追击→攻击）
export type AIState = 'idle' | 'wander' | 'investigate' | 'chase' | 'attack' | 'stunned'
export type MothForm = 'male' | 'female' | 'larva' | 'guard'
export type RefinedEntityForm =
  | 'wrangler-male' | 'wrangler-female' | 'wrangler-juvenile'
  | 'hound-hostile' | 'hound-neutral' | 'hound-ambusher'
  | 'duller-empty' | 'duller-carrying'
  | 'faceling-common' | 'faceling-anomaly' | 'faceling-tool'
  | 'skinstealer-skinned' | 'skinstealer-docile' | 'skinstealer-hunt'
  | 'clump-common' | 'clump-fasting' | 'clump-intelligent' | 'clump-intelligent-fasting' | 'clump-brick' | 'clump-stone' | 'clump-squirt'
  | 'wretch-shambler' | 'wretch-sprinter' | 'wretch-smart' | 'wretch-mutant'
  | 'corpserat-brown' | 'corpserat-gray' | 'corpserat-hotel' | 'corpserat-capybara' | 'corpserat-ceiling'
  | 'arachnid-spider' | 'arachnid-scorpion' | 'arachnid-tick' | 'arachnid-mite' | 'arachnid-herbivore'
  | `arachnid-${import('../engine/arachnidStats').ArachnidKind}` // [L8-arachnid] 17 个重制变种
  | 'creeper-rat' | 'creeper-spider' | 'creeper-human' // [creeper] Entity 17：尸鼠 / 蛛形纲感染体、爬菌人
export type EntityForm = MothForm | import('./smilers').SmilerKind | RefinedEntityForm

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
  wranglerKind?: 'male'|'female'|'juvenile'
  entityForm?: EntityForm // 显式选择的父实体内子变种；不创建独立实体或图鉴 ID
  houndKind?: 'hostile' | 'neutral' | 'ambusher'
  wretchKind?: import('./wretches').WretchKind
  dullerCarry?: boolean // 仅指定初始携物状态；未指定时沿用随机规则
  skinPhase?: 'skinned' | 'docile' | 'hunt'
  clumpWeapon?: 'brick' | 'stone' | 'squirt'
  clumpFasting?: boolean
  ratMorph?: import('./rats').RatMorph | 'gray' | 'brown'
  mothForm?: MothForm // Entity 4 的实例子变种，统一 type / 图鉴 / 注册
  smilerKind?: import('./smilers').SmilerKind // Entity 3 的实例子变种，统一 type / 图鉴 / 注册
  type: string
  name: string
  hp: number
  speed: number // 瓦片/秒
  damage: number
  sight: number // 视野（瓦片）
  hearing: number // 听觉半径
  passive?: boolean // 不被激怒不攻击
  ignorePacify?: boolean // 不受 Level 11 城市安抚效应影响
  noRetaliate?: boolean // 无危害：被攻击也绝不反击（Ferren；provoked 对其无效）
  stationary?: boolean
  hearsSprint?: boolean // 对跑步声敏感
  darkAmbusher?: boolean // 只在黑暗中逼近（光照下退却）
  lightLure?: boolean // 趋光：被手电光吸引
  drainsLight?: boolean // 近身快速耗电（死亡飞蛾扑灯）
  jamsLight?: boolean // 瘫痪手电（电弧体）
  grabs?: boolean // 攻击减速（旧团块标记；v64 肢团改由 clumpAI 专属处理，仅联机提线木偶保留读取）
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
  avoidsHumans?: boolean // 中立野生实体：人类靠近时主动拉开距离
  // ===== v42：尸鼠（合并死亡鼠）特性 =====
  grudge?: boolean // 记仇：被动实体被激怒后持续仇恨，脱战 8 秒也不平息（死亡鼠的凶猛反击血统）
  // ===== v53：L3 高智能实体实例变体（chunk raw 标记经 instantiate 浅拷贝带入）=====
  l3face?: boolean // L3 无面灵：面部长出位置/数量错误的眼耳鼻口器官
  tool?: boolean // L3 无面灵：使用石器工具（伤害上调，手部建模持有石器）
  capybara?: boolean // L3 尸鼠：水豚形态（体型变大）
  l3clump?: boolean // v64：L3 高智能肢团（体型更大、无混乱期、持械/滋水枪、贴顶俯扑；见 clumpAI）
  l3Tuned?: boolean // v64：L3 肢团的生命/伤害加成已应用（防重复）
  // ===== v60：Level 8 生态实例变体 =====
  ceilingCrawler?: boolean // 罗特尼斯尸鼠：受反向重力影响，在洞顶爬行
  arachnidMorph?: 'spider' | 'scorpion' | 'tick' | 'mite' // 蛛形纲外形
  arachnidBreed?: number // 蜘蛛/蝎/蜱/螨的花纹与体态亚种
  herbivore?: boolean // 被动食草型；受击后仍可防卫
  arachnidVariant?: import('../engine/arachnidStats').ArachnidKind // [L8-arachnid] 重制变种（缺省时按 arachnidMorph 映射）
  arachnidNest?: string // [L8-arachnid] 所属符文蛛巢 id
  arachnidMother?: boolean // [L8-arachnid] 幼蛛潮带母蛛
  // ===== [creeper] 爬菌 Entity 17 =====
  creepHost?: 'rat' | 'arachnid' | 'human' // 感染体宿主 / 爬菌人
  creepStage?: number // 感染体阶段 1–4（爬菌人 5）
  // ===== v25：栖息地（生成位置过滤）=====
  // indoor=仅室内瓦片（m.outdoor=0）；outdoor=仅室外瓦片（m.outdoor=1，如小巷/街道/田野/海面）；
  // any（缺省）=随意。生成时无符合瓦片则降级 any 并计数告警。
  habitat?: 'indoor' | 'outdoor' | 'any'
  naturalSpawn?: false // 禁止自然生成；手动生成仍可用
  aquatic?: boolean // 水生：outdoor 栖息地额外接受水域瓦片（liquid≠0，如 L7 海面）
  flying?: boolean // 飞行实体：z 是真实飞行根高度，不再由渲染器伪造上下摆动
  flightMin?: number // 相对当地地面的最低巡航根高度（米）
  flightMax?: number // 相对当地地面的最高巡航根高度（米）
  flightClimb?: number // 最大垂直速度（米/秒）
  flightHeadroom?: number // 模型根节点以上必须保留的洞顶净空（米）
  color: string
  desc: string // 图鉴外形简述（初见解锁）
  codex: EntityCodex
  aggroStinger: boolean
}

export interface Entity {
  mangledLegs?: import('../core/mangledCollision').MangledLegCollider[]
  bu?: import('../engine/bursterAI').BursterState
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
  meleeRecoveryT?: number // 人形近战命中后的收势，模拟时钟驱动
  dead: boolean
  deathT: number // 死亡动画剩余时间
  animT: number // 步态相位
  hidden?: boolean // 埋伏中（管道蠕虫）
  presentationPending?: boolean // Runtime-only GPU preparation; cannot attack before its model is ready.
  screamed?: boolean // 久坐者
  activated?: boolean // 人制品售货机：已被激活（背对触发，长出骷髅手腿追击玩家）
  ar?: import('../engine/armsAI').ArmsState // 手臂（Entité 15-FR）重制：风口/状态机/焦皮血迹（局内内存，不入存档/联机）
  webX?: number // Nguithr'xurh：陷阱（结囊）位置 x/y
  webY?: number
  ng?: import('../engine/nguithrAI').NguithrState // Nguithr'xurh 重制：巢/网囊/伏击状态机（不入存档/联机）
  disguised?: string // 窃皮者伪装：'human' = 穿着人皮（随机 NPC 外观）；v77 起不再伪装成物品
  rt?: import('../engine/ratAI').RatState
  wr?: import('../engine/wretchAI').WretchState // v78：悲尸运行时状态（变体/警觉/撞门；不入存档）
  arachnid?: import('../engine/arachnidAI').ArachnidState // [L8-arachnid] 蛛形纲运行时状态（不入存档/联机）
  sh?: import('../engine/shrimpAI').ShrimpState // v81：旱虾运行时状态（游荡/两栖/分裂/诱饵/被捕食；不入存档）
  cc?: import('../engine/camoAI').CamoState // [L8-camo] 迷彩爬行者运行时状态（伪装/听声/群猎/砸地/引开；不入存档/联机）
  lg?: import('../engine/lightguideAI').LightguideState // [L8-lightguide] 微光向导运行时状态（带路/警示/守巢/逃离；不入存档/联机）
  ss?: import('../engine/skinStealerAI').SkinStealerState // v77：窃皮者运行时状态（人皮/温顺/饥饿/激怒；不入存档/联机）
  fakeT?: number // 复印机幽灵幻影计时
  scrapeT?: number // 穿墙沙沙声计时（钝人）
  intimidated?: boolean // 猎犬：正处于「直视+噪音」威慑中（播报去抖）
  fc?: import('../engine/facelingAI').FacelingState // v90 无面灵重制：年龄 / 情绪片段 / 安抚进度（不入存档/联机）
  fcAge?: import('./facelingTraits').FacelingAge // 生成标记指定的年龄档（L2 亲子房），缺省按 id 确定
  provoked?: boolean // 被动实体（无面灵）：被玩家攻击后激怒，持续反击直到脱战平息
  l11Home?: import('../world/l11FacelingTypes').L11FacelingHome
  mothNest?: string // World-stable Beverly annex id; never rebased with the window.
  mt?: import('../engine/mothAI').MothState // 死亡飞蛾重制：运行时状态（片段/驯化/喷液/狂暴/蜷球；不入存档/联机）
  turnSlowT?: number // v58：七层之物——体节被击后转头迟滞的剩余时间
  lightStressT?: number // 七层之物被手电持续直射的累计刺激：先避光，超过阈值后暴怒
  lightRecoilT?: number // 畏光退避窗口；窗口内普通视野不会立刻把退避状态覆盖成追击
  lightWarned?: boolean // 首次直射的畏光反馈去抖
  targetEnt?: Entity // 实体对实体仇恨目标（被其他实体攻击后反击伤害者——死亡飞蛾反击尸鼠）
  huntScanT?: number // 群落捕食目标扫描节流；避免高密度生态每帧进行实体数平方级 LOS 检查
  encountered?: boolean // v54：图鉴遭遇已计数（按个体去重——看见/索敌/攻击命中/特殊交互，每只只计一次）
  blackoutSpawn?: boolean // 停电期间生成（笑魇）：灯光恢复时消散
  jy?: import('../engine/jerryAI').JerryState // 鹉主杰瑞的局内姿态与行为。
  dl?: import('../engine/dullerAI').DullerState // v63：钝人运行时状态（潜伏/隔墙抓取/携物；不入存档/联机）
  cl?: import('../engine/clumpAI').ClumpState // v64：肢团（含 L3 子变种）运行时状态（不入存档/联机）
  nw?: import('../engine/watchAI').NWState // 邻里守望 / 残缺者运行时状态（不入存档/联机）
  wg?: import('../engine/wranglerAI').WgState // 牧蛇运行时变种、轨迹与催眠／吞咽。
  pg?: import('../engine/partygoerAI').PartyState // 派对客（Entity 67）运行时状态：群体/伪装/断臂/狂战士/倒地爬走（不入存档/联机）
  hd?: import('../engine/houndAI').HoundState // v62：猎犬（含 L11 中立变种）运行时状态（不入存档/联机）
  sm?: import('./smilers').SmilerState // v61：笑魇变种与 AI 运行时状态（不入存档/联机）
  th?: import('../engine/thingAI').ThingState // 七层之物：身体链、休眠、割肉、惊逃
  cr?: import('../engine/creeperAI').CreepEntState // [creeper] Entity 17：感染体 / 爬菌人运行时状态（片段 / 记仇 / 扑击根位移；不入存档/联机）
  fr?: import('../engine/ferrenAI').FerrenEntState // [ferren] Entity 92：作息行为 / 片段 / 切行（不入存档/联机；作息时钟在 eng.ferrenRun）
  vm?: import('../engine/vendingAI').Vm36State // [vending] Entity 36：库存 / 出货片段 / 活化状态机（不入存档/联机）
  win?: import('../engine/windowAI').WinEntState // [window] 窗户 Entity 2：挂墙位姿 / 三态 / 片段（不入存档/联机）
  tiny?: import('../engine/tinyAI').TinyState // Single-player Tiny state; not persisted.
  l9FogTravel?: {mode:'arrive'|'active'|'leave';homeX:number;homeY:number;exitX:number;exitY:number} // World coordinates survive streaming shifts.
  l9FogSpawn?: boolean // L9 罕见浓雾期间生成的残缺者；雾散后随之退散
  l10BurrowT?: number // L10 旧挖掘点事件蠕虫：离开现场后在 15～25 秒内退回地下
  flightBand?: import('../core/types').FloorBand // 飞行所依附楼层；避免高度越过 band 中线后误判跨层
  flightT?: number // 垂直巡航相位
  flightReady?: boolean // 首帧已放到可飞净空，之后才平滑升降
  // ===== 联机同步（房主权威实体快照）=====
  netId?: number // 房主分配的联机 id；客人端带此字段即为「提线木偶」（位置/状态由快照驱动，本地 AI 挂起）
  netX?: number // 快照目标位置（窗口坐标，本地插值趋近）
  netY?: number
  netZ?: number
  netT?: number // 最近一次快照时间戳（ms；>8s 未刷新即移除）
}
