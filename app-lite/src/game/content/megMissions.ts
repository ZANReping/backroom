import type { StructKind } from '../core/types'

/** 游戏原创外勤故事；环境依据详见 docs/MEG-MISSIONS.md，不作为 Wiki 正史事件。 */
export type MegObjective =
  | { kind: 'walk'; level: number; n: number }
  | { kind: 'record'; level: number; n: number }
  | { kind: 'observe'; level: number; n: number; kinds: StructKind[]; subject: string }
  | { kind: 'talk'; npc: string }
  | { kind: 'deliver'; npc: string; item: string; n: number }
export interface MegStage { title: string; story: string; objective: MegObjective }
export interface MegMission {
  id: string; title: string; tier: 1 | 2 | 3 | 4; issuer: string; requires: string[]
  brief: string; ending: string; stages: MegStage[]; rep: number; coins: number; items: string[]
}
export const MEG_PROMOTION_COUNTS = [2, 5, 9, 13] as const
export const MEG_TIER_NAMES = ['基础外勤', '区域调查', '跨层行动', '联合勘探'] as const
export const MEG_NPC_PLACES: Record<string, string> = {
  nightingale: 'Level 1 · Alpha 基地中控室', river: 'Level 1 · Alpha 基地档案查询区', suanpan: 'Level 1 · Alpha 基地社区食堂',
  brandt: 'Level 3 · Gemma 基地军需处', aurora: 'Level 3 · Gemma 基地档案区',
  hobbs: 'Level 4 · Omega 基地仓储区', grove: 'Level 4 · Omega 基地数据工位', irene: 'Level 4 · Omega 基地档案区',
  barclay: 'Level 5 · 家政服务哨所', petra: 'Level 5 · 家政服务哨所', otis: 'Level 5 · 家政服务哨所',
  nestwarden: 'Level 8 · 空巢前哨', nestmedic: 'Level 8 · 空巢前哨',
  l11_tutor: 'Level 11 · 琥珀营地', l11_archivist: 'Level 11 · Beta 基地档案室', l11_quartermaster: 'Level 11 · Beta 基地补给处',
}
const walk = (level: number, n: number): MegObjective => ({ kind: 'walk', level, n })
const record = (level: number, n: number): MegObjective => ({ kind: 'record', level, n })
const observe = (level: number, n: number, subject: string, ...kinds: StructKind[]): MegObjective => ({ kind: 'observe', level, n, subject, kinds })
const talk = (npc: string): MegObjective => ({ kind: 'talk', npc })
const deliver = (npc: string, item: string, n: number): MegObjective => ({ kind: 'deliver', npc, item, n })
const stage = (title: string, story: string, objective: MegObjective): MegStage => ({ title, story, objective })

export const MEG_MISSIONS: MegMission[] = [
  { id: 'first-bearing', title: '看得见的距离', tier: 1, issuer: 'nightingale', requires: [], rep: 5, coins: 2, items: ['battery'],
    brief: '一位新来者坚持说 Alpha 近在眼前，却走了很久。夜莺需要一份能教人辨认距离的短程记录。',
    ending: '夜莺划掉了路线卡上的“目测五分钟”，改成逐段地标记录。下一位迷路者会拿到更诚实的指引。',
    stages: [stage('离开熟悉的灯光', '在 Level 1 步行观察。别把看起来很近的墙当成已经抵达的地标。', walk(1, 60)), stage('两处参照', '选两个相距至少 12 米的安全位置，分别停下记录。测量只描述这次经过。', record(1, 2)), stage('交回路线卡', '把原始数据交给夜莺，保留不一致的部分。', talk('nightingale'))] },
  { id: 'crate-ledger', title: '箱子不会等人', tier: 1, issuer: 'suanpan', requires: [], rep: 5, coins: 2, items: ['bandage'],
    brief: '算盘发现有人把昨日见过的箱子算进今天的库存。去核实现场，再凑一份真实存在的应急配给。',
    ending: '账页被分成“现场见闻”和“已入库”两栏。那两瓶水终于有了明确的去处。',
    stages: [stage('只记眼前的箱子', '靠近两只不同的补给箱观察外观，无需打开；不要把它们当成永久补给点。', observe(1, 2, '补给箱', 'crate', 'megcrate')), stage('实际交接', '交付两瓶杏仁水。个人维生物资不足时，可以先补给再办理。', deliver('suanpan', 'almond', 2)), stage('留下第二份记录', 'River 会把这条“可见不等于可用”的提醒夹进迎新资料。', talk('river'))] },
  { id: 'water-register', title: '留给下一位的水', tier: 1, issuer: 'hobbs', requires: [], rep: 5, coins: 2, items: ['almond'],
    brief: 'Omega 的补给册少了一段回程记录。霍布斯希望确认办公室里的补给设施，再为回程者补上一瓶水。',
    ending: '霍布斯把水放入应急架，并在记录后补了一句：看见设施，不等于可以省去随身储备。',
    stages: [stage('办公室补给点', '在 Level 4 靠近一台售货机观察，不需要购买，也不要靠近未遮蔽的窗户。', observe(4, 1, '售货机', 'vending')), stage('记住回程', '在本层再步行 80 米，确认自己仍能辨认一路的参照物。', walk(4, 80)), stage('补齐应急架', '回 Omega 向霍布斯交付一瓶杏仁水。', deliver('hobbs', 'almond', 1))] },
  { id: 'office-copy', title: '没有窗景的地图', tier: 1, issuer: 'grove', requires: [], rep: 5, coins: 2, items: ['battery'],
    brief: '一份旧地图把窗外的景色当作方位。格罗夫请你重新采集办公室内部的参照数据。',
    ending: '艾琳保留了旧图并加上警示：窗景未经验证，内部测点可供比对。地图不再诱导人靠近窗户。',
    stages: [stage('内部参照', '在 Level 4 选择三个相距至少 12 米的安全位置停留记录。无需接触窗户。', record(4, 3)), stage('补给设施复核', '从安全一侧观察一台售货机，为路线补上补给参考。', observe(4, 1, '售货机', 'vending')), stage('建立修订副本', '把记录交给 Omega 的艾琳，不覆盖原件。', talk('irene'))] },
  { id: 'pipe-margin', title: '管道边的空白', tier: 2, issuer: 'river', requires: ['first-bearing'], rep: 7, coins: 3, items: ['almond', 'bandage'],
    brief: '一页 Level 2 的记录只有“热”和一串划掉的数字。River 需要一条克制的补记，而不是对空白的猜测。',
    ending: '夜莺收下带有两处现场坐标的补页。未能解释的噪声仍标为未知，没有被编成一条安全路线。',
    stages: [stage('沿管廊前行', '在 Level 2 步行 100 米；保持退路，不追逐远处的声音。', walk(2, 100)), stage('隔开记录位置', '两处安全停留点各记录一次。无需触碰阀门或承受蒸汽伤害。', record(2, 2)), stage('无线电归档', '回 Alpha 向夜莺报告这次经过。', talk('nightingale'))] },
  { id: 'gemma-shift', title: '换班前的清单', tier: 2, issuer: 'brandt', requires: ['crate-ledger'], rep: 7, coins: 3, items: ['almond', 'bandage'],
    brief: 'Gemma 的换班清单少了一段外勤记录。布兰特不想让下一班把管道发出的声音误当成同伴。',
    ending: '奥萝拉把记录按位置而非传闻整理。补交的电池被留给下一班的返程照明。',
    stages: [stage('外勤边界', '在 Level 3 步行 120 米，留意狭窄通道与退路。', walk(3, 120)), stage('管线观察', '在安全距离观察两处不同管道，不拆卸仍在运转的设备。', observe(3, 2, '管道', 'pipes')), stage('换班电池', '向布兰特交付一枚电池；装备中的物品若不足，可先整理背包。', deliver('brandt', 'battery', 1)), stage('档案签收', '把声音与位置的对应记录交给奥萝拉。', talk('aurora'))] },
  { id: 'paper-trail', title: '两份补给账', tier: 2, issuer: 'irene', requires: ['water-register'], rep: 7, coins: 3, items: ['almond', 'battery'],
    brief: 'Omega 与家政服务对同一批物资的描述不同。艾琳请你带着记录去当面核对，而不是替任何一方改账。',
    ending: '佩特拉确认：一边记的是备发物资，一边记的是已收到的物资。两份账终于使用相同的口径。',
    stages: [stage('仓管口述', '先向霍布斯确认 Omega 一侧的交接记录。', talk('hobbs')), stage('酒店过路记录', '在 Level 5 步行 120 米；大厅的整洁不等于没有风险。', walk(5, 120)), stage('哨所复核', '在家政服务与佩特拉当面核对，保留两份原件。', talk('petra')), stage('实际补给', '给佩特拉交付两瓶杏仁水，作为单独登记的应急补给。', deliver('petra', 'almond', 2))] },
  { id: 'hotel-hum', title: '墙后的低鸣', tier: 2, issuer: 'otis', requires: ['office-copy'], rep: 7, coins: 3, items: ['bandage', 'battery'],
    brief: '哨所里有人把墙后的噪声说成求救。奥蒂斯需要外部观察记录，不能让未经证实的说法引人深入锅炉区。',
    ending: '巴克利把噪声标为“来源未定”。哨所没有发布救援坐标，只更新了避险提醒。',
    stages: [stage('大厅对照', '在 Level 5 三处相隔至少 12 米的位置停留记录，遇险可先撤离。', record(5, 3)), stage('复核路线', '再步行 140 米，记录沿途变化；任务不要求靠近高温锅炉。', walk(5, 140)), stage('交给维修工', '奥蒂斯将机械噪声的可能性与其他解释并列保存。', talk('otis')), stage('更正传闻', '向巴克利提交这份尚无定论的报告。', talk('barclay'))] },
  { id: 'dark-transit', title: '熄灯以后', tier: 3, issuer: 'barclay', requires: ['hotel-hum'], rep: 9, coins: 4, items: ['almond', 'bandage'],
    brief: '巴克利请你为后续远行者留下分段记录。Level 6 的黑暗会使光源失效，报告必须区分亲历与推测。',
    ending: '空巢收到一份跨层通行记录。未见实体不等于没有危险，经历幻听也不等于证明了某种生物存在。',
    stages: [stage('出发前交接', '先找佩特拉核对远行安排；整备饮水、绳索与水下装备后再出发。', talk('petra')), stage('黑暗中的短程', '在 Level 6 累计步行 100 米，不以失效的光源判断前路。', walk(6, 100)), stage('入口处的停留', '抵达 Level 7 后，在安全位置停留记录一次。不要求为记录下潜。', record(7, 1)), stage('抵达空巢', '按本局已有出口继续至 Level 8 的空巢前哨，向沃德交接。任务不保证一路安全。', talk('nestwarden'))] },
  { id: 'dry-bench', title: '一张干燥长椅', tier: 3, issuer: 'nestmedic', requires: ['paper-trail'], rep: 9, coins: 4, items: ['almond', 'battery'],
    brief: '米拉需要把洞穴外勤的暴露记录与实际补给分开登记。一张干燥长椅就是前哨今天能提供的休息处。',
    ending: '米拉在接诊册里添上环境记录，把绷带放进公共应急包。这里没有奇迹，但有人可以坐下来喘口气。',
    stages: [stage('洞穴环境记录', '在 Level 8 三个相隔至少 12 米的地点停留。远离积水深处与可疑气体。', record(8, 3)), stage('交接清洁绷带', '向米拉交付两份绷带；无需带回生物或不明水样。', deliver('nestmedic', 'bandage', 2)), stage('更新接待提醒', '向沃德转交此次外勤记录，用于提醒下一位到访者。', talk('nestwarden'))] },
  { id: 'ninth-road', title: '黄旗之后', tier: 3, issuer: 'nestwarden', requires: ['pipe-margin'], rep: 9, coins: 4, items: ['almond', 'bandage'],
    brief: '沃德想知道流浪者离开前哨后遇到了什么。第九大道的指引能帮助辨认方向，却不能消除洞穴风险。',
    ending: '两份记录一起留在空巢。方向指引仍在，但“跟着走就绝对安全”被明确划去。',
    stages: [stage('离开前哨', '在 Level 8 累计步行 180 米，优先沿已辨识的指引前进。不要拆走路标。', walk(8, 180)), stage('三处停留', '在相隔至少 12 米的三个安全位置记录，观察到危险时优先撤离。', record(8, 3)), stage('医护复核', '米拉将检查报告是否遗漏了失温与浸水风险。', talk('nestmedic')), stage('前哨存档', '回沃德处交付完整记录。', talk('nestwarden'))] },
  { id: 'city-lesson', title: '安静不等于许可', tier: 3, issuer: 'l11_tutor', requires: ['office-copy'], rep: 9, coins: 4, items: ['almond', 'battery'],
    brief: '琥珀营地的新来者把 Level 11 的平静理解成了随意试探实体的许可。林希望用一次实地走访纠正这件事。',
    ending: '课堂多了一份步行记录：观察不需要挑衅，平静也不赋予任何人伤害居民的权利。',
    stages: [stage('城市步行', '在 Level 11 累计步行 220 米。保持距离，不攻击实体或居民。', walk(11, 220)), stage('街区参照', '在三个相距至少 12 米的公共位置停下记录，无需进入封闭建筑。', record(11, 3)), stage('补给处确认', '向 Beta 军需官科林询问新来者的补给安排。', talk('l11_quartermaster')), stage('回到课堂', '把记录交给琥珀营地的林。', talk('l11_tutor'))] },
  { id: 'suburban-margin', title: '不要追赶雾', tier: 4, issuer: 'nestwarden', requires: ['ninth-road'], rep: 11, coins: 5, items: ['almond', 'bandage', 'battery'],
    brief: '一张通往城市的手绘图把 Level 9 涂成了普通住宅区。沃德请你修订沿途风险，最终把报告交至 Beta。',
    ending: 'Beta 收到更谨慎的过路记录。没有人因你的报告被派进雾中，未知区域依旧清楚地标为未知。',
    stages: [stage('午夜街道', '在 Level 9 累计步行 160 米。避开雾与异常声响；不必进入住宅。', walk(9, 160)), stage('退路记录', '在本层两个相距至少 12 米的安全位置短暂停留，不需要等待雾出现。', record(9, 2)), stage('麦田边界', '通过本局已有出口抵达 Level 10，累计步行 140 米，不挖掘地面。', walk(10, 140)), stage('城市签收', '抵达 Level 11，向 Beta 的艾达交付报告。', talk('l11_archivist'))] },
  { id: 'harvest-caution', title: '丰收的表象', tier: 4, issuer: 'l11_quartermaster', requires: ['city-lesson'], rep: 11, coins: 5, items: ['almond', 'battery', 'bandage'],
    brief: '有人建议取消长途配给，因为 Level 10 看上去到处都是食物。科林要的是一份可靠记录，不是一袋未经检验的麦穗。',
    ending: '科林保留了长途配给。开阔田野的外观不能替代营养与风险评估，报告不建议挖掘或试吃。',
    stages: [stage('地表调查', '使用已知出口前往 Level 10，在地表步行 200 米。不要为了任务挖掘。', walk(10, 200)), stage('分区记录', '在四个相距至少 12 米的位置记录作物环境，无需采集或食用。', record(10, 4)), stage('回程配给', '回 Level 11 向科林交付两瓶杏仁水，继续使用已知补给。', deliver('l11_quartermaster', 'almond', 2)), stage('课堂修订', '请林把“看上去能吃”与“经过验证”分开写进课程。', talk('l11_tutor'))] },
  { id: 'shelter-chain', title: '有人接住这一程', tier: 4, issuer: 'l11_archivist', requires: ['dry-bench'], rep: 11, coins: 5, items: ['almond', 'bandage', 'battery'],
    brief: '艾达正整理洞穴至城市的接待信息。报告里不能只有地形，还应留下哪里有人能听完一句求助。',
    ending: '空巢、Beta 与琥珀营地的接待记录连在一起。这不是安全通行保证，而是一份能找到负责人的名册。',
    stages: [stage('核对空巢', '前往空巢，与米拉当面核对接待信息；请先准备好往返补给。', talk('nestmedic')), stage('前哨确认', '向沃德确认报告中的联系职责，不公开求助者身份。', talk('nestwarden')), stage('Beta 补给', '返回 Level 11，与科林核对到达后的补给安排。', talk('l11_quartermaster')), stage('档案闭环', '交回艾达处，保留每一站的来源说明。', talk('l11_archivist'))] },
  { id: 'unfinished-atlas', title: '地图上的留白', tier: 4, issuer: 'nightingale', requires: ['gemma-shift', 'dark-transit'], rep: 11, coins: 6, items: ['almond', 'bandage', 'battery'],
    brief: '夜莺希望把几段实地报告整理成可继续修订的档案。它不会宣称找到了出口，也不会把未知涂成安全。',
    ending: '艾达在总卷末尾留了一整页空白：给下一位活着回来、愿意纠正这张地图的人。联合勘探记录正式结案。',
    stages: [stage('Gemma 的原件', '向奥萝拉当面确认工业区记录的版本。', talk('aurora')), stage('Omega 的修订', '请艾琳核对补给与办公室参照的修订说明。', talk('irene')), stage('空巢的边界', '向沃德核对洞穴报告，把无法保证的路段明确列出。', talk('nestwarden')), stage('抵达后再测量', '在 Level 11 的四个相距至少 12 米的位置记录，作为新卷的起点。', record(11, 4)), stage('交付未完成的地图', '把带有留白的总卷交给 Beta 的艾达。', talk('l11_archivist'))] },
]
export const MEG_MISSION_BY_ID = Object.fromEntries(MEG_MISSIONS.map(m => [m.id, m])) as Record<string, MegMission>
