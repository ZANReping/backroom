// Level 5「恐怖酒店」层级定义（v54：无限 chunk 生成；无限化重制见 infiniteL5.ts）
import type { LevelDef } from '../core/types'

export const L5: LevelDef = {
  id: 5,
  name: '恐怖酒店',
  flavor: '无限延伸的 1930 年代酒店综合楼：挑高主厅、贝弗莉室、餐厅与客房翼，深处理着维修大厅、健身房、室内泳池与锅炉房。老式唱机随机播放爵士乐；死亡飞蛾的主巢——你的手电是它们的邀请函。',
  lore: 'Level 5「Terror Hotel」。1930 年代装潢的无限酒店综合楼：红木红金墙纸、异域红地毯、挑高主厅、贝弗莉室、餐厅、客房、休息室、健身房、室内泳池与锅炉房。异常洁净（污渍自行消失）；唱机播放爵士乐，墙后有派对喧闹与低语。确认实体：死亡飞蛾（主巢之一，集群出没）、猎犬、窃皮者（伪装成酒店侍者）、Nguithr’xurh 与穿正装的尸鼠，密度远低于其他层级。M.E.G. Outpost「Housekeeping」驻扎于此。出口：主厅嵌墙电梯折返 Level 3、古典楼梯上行回 Level 4、锅炉房深处完全黑暗的门下行 Level 6、客房偶现的深色木门通往 Level 9。——据 Backrooms Wikidot 整理',
  palette: { floor: '#5e2f33', floorAlt: '#522a2e', wall: '#5a2e30', wallTop: '#402224', accent: '#b8924a', light: '#ffd9a0', decal: '#462427' }, // v54：红金酒店调微调（墙面稍亮、金饰更暖）
  gen: 'hotel', // 有限 hotel 生成分支自此为死代码（同 L2 pipes / L3 grid / L4 office 先例）；WALL_H/贴图仍按 gen 取
  size: 76, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v54：无边界无限 chunk 流式生成（infiniteL5.ts）
  skipPrefabs: ['guestroom', 'beverlyhall'], // 有限模式忽略（死代码配套保留）
  entities: [
    // wiki：死亡飞蛾主巢（集群 2~4 只一小群 + 单列概率，占比最高）、猎犬、窃皮者（human 伪装=酒店侍者形象）、
    // Nguithr'xurh（天花网囊）、尸鼠（酒店正装变种 ratMorph 'hotel'）；总密度 ~1.7%/chunk 明显低于其他层
    { type: 'deathmoth', w: 18, min: 0, max: 1 },
    { type: 'hound', w: 10, min: 0, max: 1 },
    { type: 'skinstealer', w: 10, min: 0, max: 1 },
    { type: 'corpserat', w: 8, min: 0, max: 1 },
    { type: 'nguithr', w: 6, min: 0, max: 1 },
  ],
  items: [
    { type: 'skeleton', w: 6 }, // 万能钥匙——客房上锁门的对应解法（房门锁机制保留）
    { type: 'silverware', w: 10 },
    { type: 'sedative', w: 10 },
  ],
  itemCount: [12, 16], // 有限模式忽略（无限由生成器按 chunk 投放）
  structures: ['frontdesk', 'door', 'ballroom', 'bed', 'sconce', 'mirror', 'crate', 'corpse', 'suitcase', 'locker', 'fridge', 'safebox'],
  containerBias: 0.55,
  sd: 'Survival Difficulty: Class 2 · M.E.G. Outpost「Housekeeping」驻扎',
  exits: [
    // v54 无限化出口链——电梯：主厅壁龛槽位（regionHost 超区域 + 出生 chunk 保底），免费折返 Level 3（嵌墙同 L4）；
    // 古典楼梯：8×8 超区域 ~55% 宿主 + 出生 chunk 保底 1 部，上行返回 Level 4（L4→L5 落点在其 2 格外空旷地板）；
    // 锅炉房深处完全黑暗的门：每个锅炉房街区 1 扇（无灯黑门，→ Level 6，Wikidot 正典连接）；
    // 深色木门：客房房门 ~2% 替代（→ Level 9）
    { kind: 'elevatorshaft', name: '电梯', dest: 3, anim: 'shutter' },
    { kind: 'oldstairs', name: '年久失修的古典楼梯', dest: 4, anim: 'bloom' },
    { kind: 'boilerdeep', name: '完全黑暗的门', dest: 6, anim: 'iris', cutIn: 'dark' },
    { kind: 'darkwooddoor', name: '深色木门', dest: 9, anim: 'iris', cutIn: 'dark' },
  ],
  entrance: '古典楼梯底部',
  exitDesc: '出口：电梯（主厅嵌墙，→B3 回程）；年久失修的古典楼梯（→B4 回程）；锅炉房深处完全黑暗的门（→B6，Wikidot 推荐的建基路线）；客房深处偶现的深色木门（→B9）。大堂旋转门推不动——它从来就不通向外面。',
  lightDensity: 0.008,
  darkness: 0.6,
  lightSoft: 1.2, // v54：无限化后灯网按大厅/房间布置 + 暖调调色板补偿（同 L4 思路）
}
