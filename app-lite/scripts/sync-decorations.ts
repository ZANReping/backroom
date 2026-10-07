import {writeFileSync} from 'node:fs'
import {DECOR_REGISTRY,decorLevelSortKey} from '../src/game/content/decorRegistry'
import {TRADE_DEFS} from '../src/game/content/tradeDecor'
import {L5_DECOR_DEFS} from '../src/game/content/l5Decor'
import {ALPHA_DEFS} from '../src/game/content/alphaDecor'
const r=DECOR_REGISTRY,escape=(s:string)=>s.replaceAll('|','／').replaceAll('\n',' ')
let out='# DECORATIONS —— 装饰物分类清单\n\n> 由 `app/src/game/content/decorRegistry.ts` 统一注册表生成。修改模型先更新注册定义，再同步本表。尺寸以米计；交互不等同于可搜刮。\n\n'
for(const [cat,title] of [['solid','有碰撞体积'],['nonsolid','无碰撞体积（低模）'],['decal','仅贴图贴花']] as const){
 const rows=r.filter(d=>d.cat===cat).sort((a,b)=>decorLevelSortKey(a)-decorLevelSortKey(b)||a.name.localeCompare(b.name,'zh-CN'))
 out+=`## ${title}（${rows.length}）\n\n| 名称 | ID | 交互 | 容器 | 生成层级 | 说明 |\n|---|---|---|---|---|---|\n`
 out+=rows.map(d=>`| ${d.name} | \`${d.id}\` | ${d.interactive?'✓':''} | ${d.container?'✓':''} | ${d.levels.join('、')} | ${escape(d.note??'')} |`).join('\n')+'\n\n'
}
out+='## 商贸构件默认尺寸与参数\n\n模型和复合碰撞均来自 `tradeDecor.ts`；支持独立摆放、设计模式三维预览与旋转。布局存储 `kind/x/y/w/h/data`，尺寸参数 width/depth 对应结构 w/h；高度、安装高度、朝向、颜色、标签和业务参数存入 data。颜色或店号变体不重复计数。静态货物不进入搜刮表；`trade_car` 仅为交易保险库不可驾驶、不可搜刮的固定展品，普通 L1 仍不生成汽车。任务箱以 cargoId 独立管理。\n\n| 名称 | ID | 宽×深×高 | 碰撞 | 交互 |\n|---|---|---|---|---|\n'
out+=TRADE_DEFS.map(d=>`| ${d.name} | \`${d.id}\` | ${d.w}×${d.d}×${d.height} | ${d.solid?'✓':''} | ${d.interactive?'✓':''} |`).join('\n')+'\n\n'
out+=`允许参数：${TRADE_DEFS[0].parameters.join(' / ')}。设施支持 services、faction、room、access；普通未配置设施仅提供查看说明。\n\n## Level 5 酒店构件默认尺寸\n\n${L5_DECOR_DEFS.length} 项构件均支持设计模式预览与旋转；这些静态构件不生成容器或交互记录，游戏原有交互物仍保留。\n\n| 名称 | ID | 宽×深 | 安装高度 | 碰撞 |\n|---|---|---|---|---|\n${L5_DECOR_DEFS.map(d=>`| ${d.name} | \`${d.id}\` | ${d.w}×${d.d} | ${d.height} | ${d.solid?'✓':''} |`).join('\n')}\n\n## Alpha 基地构件默认尺寸\n\n${ALPHA_DEFS.length} 项构件中，通用模型来自 \`content/alphaDecor.ts\`；研究署/入口模型来自 \`content/alphaResearchDecor.ts\`；支持设计模式预览与旋转，这些静态构件默认不是容器，配置 facility 的桌台和冷藏柜实例承接现场业务。\n\n| 名称 | ID | 宽×深 | 安装高度 | 碰撞 |\n|---|---|---|---|---|\n${ALPHA_DEFS.map(d=>`| ${d.name} | \`${d.id}\` | ${d.w}×${d.d} | ${d.height} | ${d.solid?'✓':''} |`).join('\n')}\n\n## 统计\n\n- 条目总数 ${r.length}；可交互 ${r.filter(d=>d.interactive).length}，容器 ${r.filter(d=>d.container).length}。\n- 重建命令：在 app 内运行 \`npx esbuild scripts/sync-decorations.ts --bundle --platform=node --format=esm --outfile=.cache/sync-decorations.mjs\` 后运行 \`node .cache/sync-decorations.mjs\`。\n`
out=out.replace('研究署/入口模型来自 `content/alphaResearchDecor.ts`；','研究署/入口模型来自 `content/alphaResearchDecor.ts`；档案署模型来自 `content/alphaArchiveDecor.ts`；行政署模型来自 `content/alphaAdminDecor.ts`；居民区模型来自 `content/alphaResidentialDecor.ts`；社区走廊模型来自 `content/alphaCommunityDecor.ts`；').replace('配置 facility 的桌台和冷藏柜实例承接现场业务。','只有带有 facility 数据的业务家具承接现场业务；档案柜编号遵循“字母通道 + 1 位自底向上层数 + 2 位水平位置”（例如 A124）。')
writeFileSync(new URL('../../DECORATIONS.md',import.meta.url),out)
