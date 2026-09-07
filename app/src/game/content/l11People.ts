import type { NpcDef } from './npcs'

// Serializable definitions shared by worker generation and the live NPC registry.
export const L11_PEOPLE: NpcDef[] = [
  { id: 'l11_archivist', name: '艾达·沃伦', role: 'Beta档案员', faction: 'meg',
    personality: '仔细、耐心，习惯先核对来源再下结论。', background: '负责接收流浪者带回的磁带，并整理通往终点的研究档案。',
    avatar: { hair: 2, hairColor: '#756c61', skin: '#bb967b' }, uniform: { top: '#b7b3a1', badge: '#c5ad4c' },
    lines: [{ npc: '六盘记录缺一不可。凑齐后，档案室里的专用门会为你打开。请记住，那不是一条普通返程路。', opts: [{ text: '我会带齐磁带。', action: 'leave' }] }], idle: ['录音和报告都要留下副本。'] },
  { id: 'l11_quartermaster', name: '科林·里德', role: 'Beta军需官', faction: 'meg', warehouse: 'meg',
    personality: '务实，愿意帮助刚从郊区走来的流浪者。', background: '负责总部补给、救助与阵营仓库。', avatar: { hair: 1, hairColor: '#30291f' },
    currency: 'eaglecoin', trade: [{ item: 'almond', price: 2 }, { item: 'canned', price: 3 }, { item: 'battery', price: 2 }],
    lines: [{ npc: '补给在这里。仓库与其他M.E.G.基地互通。不要在街道上挑衅实体；安抚效应并不是护身符。', opts: [{ text: '购买补给。', action: 'trade' }, { text: '告辞。', action: 'leave' }] }], idle: ['下一批配给已经登记。'] },
  { id: 'l11_tutor', name: '林·默瑟', role: '琥珀营地教员', faction: 'meg',
    personality: '亲切而严谨。', background: '在Camp Amber教授路线识别、实体避让与野外记录。', avatar: { hair: 4, hairColor: '#29231c' },
    lines: [{ npc: '先记住安全街道，再探索无名小巷。陌生招牌、街机和窗户都可能是未经确认的出口。不要随便触碰。', opts: [{ text: '如何辨认方向？', next: 1 }, { text: '谢谢。', action: 'leave' }] },
      { npc: '查看市政导览牌，把首都、新时代广场与总部的位置记到地图上。城市的细节会变，但主路和我们的地标稳定。', opts: [{ text: '明白了。', action: 'leave' }] }], idle: ['这节课讲如何活着回来。'] },
  { id: 'l11_trader', name: '玛拉·韦斯特', role: '新时代广场行商', faction: 'bntg', warehouse: 'bntg',
    personality: '爽快，熟悉交易规则。', background: '经营广场的补给摊，使用压印币交易。', avatar: { hair: 3, hairColor: '#553323' },
    currency: 'presses', trade: [{ item: 'almond', price: 2 }, { item: 'canned', price: 3 }, { item: 'bandage', price: 2 }, { item: 'battery', price: 2 }],
    lines: [{ npc: '欢迎来到新时代广场。压印币通用，寄存仓库与商人之家互通。', opts: [{ text: '看看商品。', action: 'trade' }, { text: '告辞。', action: 'leave' }] }], idle: ['繁荣缔造和平。'] },
  { id: 'l11_caretaker', name: '伊莱·桑德斯', role: '首都市民联络员', faction: 'capital', medic: true,
    personality: '平静热心。', background: '在首都的公共服务亭帮助初来者，维护纪念街道与市民记录。', avatar: { hair: 2, hairColor: '#9b9892' },
    lines: [{ npc: '这里是首都。广场和住宅区都有人居住，饮水设施可以使用。沿导览牌能找到贸易广场和M.E.G.总部。', opts: [{ text: '街上为什么这么安静？', next: 1 }, { text: '谢谢。', action: 'leave' }] },
      { npc: '人们集中生活在安全街区。那些窗户黝黑的大厦从来没有开过门，别在门口浪费力气。', opts: [{ text: '我知道了。', action: 'leave' }] }], idle: ['请让纪念碑前的路保持畅通。'] },
]
export function l11Resident(id: string, faction: string, variant: number): NpcDef {
  const names = ['罗伊', '米娅', '埃文', '妮娜', '卡尔', '安娜']
  return { id, name: names[variant % names.length], faction, role: faction === 'bntg' ? '广场雇员' : faction === 'meg' ? '巡逻队员' : '城市居民',
    personality: '谨慎友好，熟悉附近街道。', background: '定居在不夜城，在公共设施与贸易街区间步行。',
    avatar: { hair: variant % 3, hairColor: ['#33251c', '#756251', '#282828'][variant % 3], top: ['#67746f', '#887967', '#5d697b'][variant % 3] },
    lines: [{ npc: '街道上大多安全。别去激怒猎犬，也别擅自跨过封锁异常出口的护栏。', opts: [{ text: '祝你平安。', action: 'leave' }] }],
    idle: ['楼里的水电一直有。', '那块广告昨天似乎不是这个样子。'] }
}
