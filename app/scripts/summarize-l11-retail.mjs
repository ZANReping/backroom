import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),root=path.join(app,'reports/l11-reference')
const read=p=>JSON.parse(readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''))
const label='retail-v16-final',lowLabel='retail-v16-low-classic',budgetLabel='retail-v16-shadow-budget',r=read(label+'/runtime.json'),low=read(lowLabel+'/runtime.json'),budget=read(budgetLabel+'/runtime.json')
for(const [name,data] of [[label,r],[lowLabel,low],[budgetLabel,budget]]){
  if(!data.ok||data.errors.length||data.setup.version!==16||!data.retail?.ok||!data.command.includes('--headless=new')||!data.cleanup.profileRemoved||!read(name+'/process-cleanup.json').cleanupConfirmed)throw Error('Incomplete verification: '+name)
}
if(r.views.length!==11||low.views.length!==4||r.cycles?.length!==3||r.random?.length!==2||r.roomWalks?.length!==1)throw Error('Missing v16 runtime coverage')
for(const [data,mode] of [[low,'classic'],[budget,'realistic']]){
  if(data.retail.mode!==mode||data.retail.shadowBudgets?.map(b=>b.requested).join(',')!=='0,1,2,4')throw Error('Missing shadow budget coverage: '+mode)
  if(data.retail.shadowBudgets.some(b=>b.lights.length>(mode==='realistic'?Math.min(2,b.requested):0)||b.active.some(l=>!l.castShadow||l.shadowIntensity<=0||!l.shadowMap)))throw Error('Unshadowed exterior shop light: '+mode)
}
const retail=read('retail-v16/static.json'),twins=read('retail-v16/twins.json'),mesh=read('../l11-remake/mesh-check.json'),arch=read('architecture/static.json')
if(!retail.ok||retail.ordinary.length<3||!twins.ok||twins.lodFrames!==12||mesh.decor!==106||mesh.buildings!==30||!arch.ok)throw Error('Missing v16 static coverage')
const checks=[['build','build','✓ built in'],['check:l11','generation','L11 missions OK'],['check:l11-retail','retail','"sampleCells"'],['check:l11-twins','twins','"lodFrames": 12'],['check:l11-meshes','meshes','"uniqueTextures"'],['check:l11-reference','reference','"failures": []'],['check:l11-props','props','"placements"'],['check:l11-architecture','architecture','"recipes"']].map(([command,key,marker])=>{
  const file='v16-'+key+'.log';if(!readFileSync(path.join(root,file),'utf8').includes(marker))throw Error('Static check failed: '+key)
  copyFileSync(path.join(root,file),path.join(root,label,key+'.log'));return {command:'npm run '+command,passed:true,log:key+'.log'}
})
for(const [source,dest] of [['retail-v16/static.json','retail-static.json'],['retail-v16/twins.json','twins-static.json'],['../l11-remake/mesh-check.json','mesh-check.json'],['architecture/static.json','architecture.json'],['../l11-remake/generation-check.json','generation-check.json']])copyFileSync(path.join(root,source),path.join(root,label,dest))
const commands=[
  `node scripts/verify-l11-reference.mjs --label=${label} --case=01,03,14,15,16,30,31,33,45,46,47 --validate=west-piers --rooms --architecture --random-cases=retail,twins --retail --lifecycle`,
  `node scripts/verify-l11-reference.mjs --label=${lowLabel} --case=03,14,30,31 --low --classic --visual-only --retail`,
  `node scripts/verify-l11-reference.mjs --label=${budgetLabel} --case=14 --visual-only --retail`,
  `& ./scripts/check-l11-qa-cleanup.ps1 -Labels @('retail-v16-draft','retail-v16-verified','${label}','${lowLabel}','${budgetLabel}')`,
]
const changes=[
  '按店门建立店铺坐标系。收银台面对顾客，双面货架沿进深排列，冷柜靠不透明后墙；玻璃转角、主通道和后门保持开放。四个朝向及旋转街区使用同一程序。',
  '登记并制作双面商品陈列架、店铺收银柜台、玻璃门饮料冷柜。柜体、层板、瓶罐、POS 及门框具有真实厚度；采用已有材质，商品上没有编造的品牌或价格。当前为 30 种建筑、106 种装饰原型。',
  '营业厅照明从单灯改为沿通道的灯具网格；真实光照档从街上看进角店时，只启用有实际阴影的前两盏室内灯，并服从用户更低的预算。经典档或关闭阴影时不增加外部可见的店内点光；室内仍保留原有照明。两种模式均实测 0／1／2／4 盏设置，避免隔墙漏光。',
  '临街入口换为与橱窗一致的窄金属框；降低玻璃点光高光、室内照明和浅色瓷砖的明度；横招背框与深色檐口衔接，保留原有 Famima!! 文字。',
  '连廊底面改为长条分板的细接缝，支承条接入两座塔楼，并补齐侧边收口。它仍是有上下表面和碰撞的完整体积，蓝色侧墙仍属于两座塔楼。',
  '修复普通双塔的朝向：入口、双塔内侧、连廊和两端支承共同随临街方向转动。蓝色／深色中窗／蓝色仅在连廊下方组合，不再沿整面侧墙重复；浅色玻璃、红色细条和横向分格统一到远近模型。',
]
const observations=[
  ['店铺两面玻璃与朝向','原图圆挑牌位于转角柱旁，横招沿两面店铺立面。玻璃后能看到陈列。','14-storefront-corner','对应店门、转角玻璃、货架和招牌使用同一建筑局部坐标。'],
  ['店内陈列和照明','照片可辨认陈列、暖色顶边和窗下广告；无法读出商品标签，也没有完整室内平面。','15-storefront-interior','新增陈设属于合理的室内补全，不能称照片中准确品牌或平面的复原。'],
  ['反向观察与入口','从店内向两面玻璃观察，能看见外部街道；入口须真正可通行。','30-shop-looking-out','固定原有机位，并通过完整动线验证。'],
  ['收银区、柜体后部','照片没有展示收银设备或冷柜全貌。','45-shop-checkout','新增近景用于验证背面、厚度、朝向和碰撞；不作为原图已存在这些设备的证据。'],
  ['双塔与楼顶连廊','原图显示两面蓝色侧墙、红色细横条、顶部实体连接及分板底面。','31-roof-link-oblique','面板、收边、蓝色组块与浅色玻璃已调整；尺寸、总体比例及不可见的屋面构造仍为推定。'],
  ['连廊下方前庭','宽台阶接滨水步道，楼间空间保持开敞。','16-twin-courtyard','保留前庭和台阶的真实结构，使用额外斜视图核对遮挡关系。'],
]
const remaining=[
  '没有达到“几乎完全一致”。原图中的低窗广告图案、细小文字、商品包装和室内实际平面仍无法完整确认；未擅自补写文字，也未把新增陈设当成准确复原。',
  '当前商品仍偏简化、重复，货架层数与陈列密度仍须和窗内原像素继续比较。招牌字的立体厚度、玻璃反射、门边细节仍有差异。',
  '双塔侧墙的蓝色分格数量与宽度、连廊长宽和屋面构造、建筑总体比例与参考照片仍有差异。面板、支承和室内尺寸均为单张图片推定。',
  '整体街景的纵深、路面材质、树冠和日照仍需继续收敛。其他七张参考图的逐项记录保留，尚未全部完成最终实机还原。',
  '本轮验证固定种子和已列场景，性能数据来自实际浏览器和 GPU，不代表所有城市、所有硬件稳定 60 FPS。',
]
const compact=x=>({views:x.views,retail:x.retail,validation:x.validation,roomWalks:x.roomWalks,random:x.random,walking:x.walking,cycles:x.cycles?.map(c=>({memory:c.memory,nonPooledTextures:c.nonPooledTextures,cachedAvatarTextures:c.cachedAvatarTextures,roots:c.roots,buildings:c.buildings,references:c.references,foliageCache:c.foliageCache})),hardware:x.hardware,browser:x.browser.product,errors:x.errors,networkErrors:x.networkErrors.map(e=>e.response?{url:e.response.url,status:e.response.status}:{error:e.errorText}),cleanup:x.cleanup})
const acceptance={version:16,changes,observations,remaining,checks,commands,static:retail,twins,high:compact(r),low:compact(low),shadowBudget:compact(budget)}
writeFileSync(path.join(root,label,'acceptance.json'),JSON.stringify(acceptance,null,2)+'\n')
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const list=items=>'<ul>'+items.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>'
const picture=(src,title)=>'<figure><img loading="lazy" src="'+esc(src)+'" alt="'+esc(title)+'"><figcaption>'+esc(title)+'</figcaption></figure>'
const n=v=>Number(v).toFixed(1)
const performance=`${r.browser.product}；${r.hardware.renderer}。1080p 固定种子 ${r.seed}，新游戏种子 ${r.setup.newGameSeed}。移动帧时中位 ${n(r.walking.median)}ms，P95 ${n(r.walking.p95)}ms，最长 ${n(r.walking.max)}ms；采样末 ${r.walking.draws} 次绘制、${r.walking.triangles} 三角形。`
const lifetime=`三次重载：几何 ${r.cycles.map(c=>c.memory.geometries).join('/')}；非角色池纹理 ${r.cycles.map(c=>c.nonPooledTextures).join('/')}。这些是资源计数，不是显存字节。`
const validation=`静态覆盖 ${retail.buildings} 栋、${retail.shops} 间店铺、${retail.doorRoutes} 个门口连接、${retail.sampleCells} 个碰撞采样格，含四朝向及三个普通种子。双塔检查四朝向×三级模型、旋转后的顶点一致性、连廊上下碰撞与支承。实机通过 11 个固定视角、店铺动线、柜台下落、店门双向、办公室楼梯与房门、普通种子店铺／双塔、拱桥／桥墩和岸道检查。低画质经典光照另测四个店铺／运河机位及相同店内动线。最终灯光保护另跑真实光照街角机位；两种模式均通过 0／1／2／4 盏阴影预算和隔墙熄灯检查。运行错误均为 0；网络异常保留在 runtime.json。`
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 店铺与连廊细节对照 · v16</title><style>body{margin:0;background:#111b20;color:#e7ecee;font:16px/1.65 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}h1{font-size:30px}h2{margin-top:36px;color:#a7d5df}a{color:#80d4e7}p,li{max-width:1150px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;background:#1b282f;padding:8px}img{width:100%;height:auto;display:block}figcaption{padding:10px;font-size:14px;color:#c8d5d9}.notice{padding:18px;border-left:4px solid #edbc73;background:#302c23}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #3a4d57;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#071115;padding:16px}@media(max-width:850px){.grid{grid-template-columns:1fr}}</style><main><h1>Level 11：位置、朝向、店铺与连廊 · v16</h1><p><a href="inspection/index.html">原像素放大：9 张原图／28 个局部</a> · <a href="${label}/acceptance.json">验证数据</a> · <a href="index-v15.html">v15 保留报告</a></p><p class="notice">这是继续还原的阶段记录。功能和空间检查通过，视觉仍有明显差距；没有把摄像机相似或测试通过当成完整复刻。</p>${list(changes)}<h2>先核对原像素</h2><div class="grid">${picture('inspection/left-shop.png','11iconic：可辨认店铺、招牌、玻璃与窗下广告；未添加不存在的文字。')}${picture('inspection/canal-roof-link.png','11canal：蓝色侧墙、红色横条、连廊底面和前庭台阶。')}</div><h2>街角与反向</h2><div class="grid">${picture(label+'/14-storefront-corner.png','固定街角：陈设、玻璃、门框和双面招牌。')}${picture(label+'/33-shop-blade-reverse.png','沿另一方向看回店铺：标牌固定在柱和立面上。')}</div><h2>真实店内空间</h2><div class="grid">${picture(label+'/15-storefront-interior.png','从后门向临街入口：货架、主通道和灯具位置。')}${picture(label+'/30-shop-looking-out.png','从内部向转角玻璃：仍可看见街道。')}${picture(label+'/45-shop-checkout.png','收银区近景；不可见部分属于建模补全。')}${picture(label+'/46-shop-refrigerators.png','靠实墙的冷柜与后部通道。')}</div><h2>连廊及整体尺度</h2><div class="grid">${picture(label+'/31-roof-link-oblique.png','连廊底面细缝、支承和边缘收口。')}${picture(label+'/16-twin-courtyard.png','另外一个地面视角：空隙、侧墙和连廊空间关系。')}</div><div>${picture(label+'/47-roof-link-upper-reverse.png','新增高处反向检查：连廊上表面、与塔楼连接和背面；该视角用于核对结构，并非照片机位。')}</div><div class="grid">${picture('../../reference/L11/11iconic.jpg','11iconic 原图')}${picture(label+'/01-office-street.png','同一固定城市街景机位；整体仍有差距。')}${picture('../../reference/L11/11canal.png','11canal 原图')}${picture(label+'/03-canal.png','同一固定运河机位；继续核对总体比例。')}</div><h2>逐部位依据与限度</h2><table><tr><th>部位</th><th>照片可确认</th><th>本轮与限度</th></tr>${observations.map(([a,b,,d])=>'<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td><td>'+esc(d)+'</td></tr>').join('')}</table><h2>普通世界和低画质</h2><div class="grid">${picture(label+'/random-retail.png','普通种子 42 的转向店铺：使用同一配方。')}${picture(label+'/random-twins.png','普通种子 42 的双塔和连廊。')}${picture(lowLabel+'/14-storefront-corner.png','低画质／经典：同一街角机位。')}${picture(lowLabel+'/30-shop-looking-out.png','低画质／经典：同一反向机位。')}${picture(lowLabel+'/03-canal.png','低画质／经典：相同运河场景。')}${picture(lowLabel+'/31-roof-link-oblique.png','低画质／经典：相同连廊仰视。')}</div><h2>验证结果</h2><p>${esc(validation)}</p><p>${esc(performance)}</p><p>${esc(lifetime)}</p><p>每次 QA 使用真实 --headless=new、独立端口及 profile。进程、监听端口和目录清理由只读检查复核。首轮 <a href="retail-v16-draft/runtime.json">draft 记录</a> 保留；其店内过亮、木框问题已在当前图中修正。</p><h2>仍待还原</h2>${list(remaining)}<h2>可复跑命令</h2><pre>${esc(checks.map(c=>c.command).concat(commands,['node scripts/summarize-l11-retail.mjs']).join('\n'))}</pre></main></html>`
writeFileSync(path.join(root,'index.html'),html)
writeFileSync(path.join(root,'README.md'),`# Level 11 店铺与连廊细节对照（参考版本 16）\n\n[查看原图和实机对照](index.html) · [原像素放大](inspection/index.html) · [完整数据](${label}/acceptance.json) · [v15](README-v15.md)\n\n${changes.map(s=>'- '+s).join('\n')}\n\n## 检查\n\n${validation}\n\n${performance}\n\n${lifetime}\n\n独立无头浏览器及服务已清理并复核。\n\n## 仍待还原\n\n${remaining.map(s=>'- '+s).join('\n')}\n\n## 命令\n\n\`\`\`\n${checks.map(c=>c.command).concat(commands,['node scripts/summarize-l11-retail.mjs']).join('\n')}\n\`\`\`\n`)
const links=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(p=>!p.includes('://'))
const missing=links.filter(p=>!existsSync(path.resolve(root,p)))
writeFileSync(path.join(root,label,'report-links.json'),JSON.stringify({ok:!missing.length,checked:links.length,missing},null,2))
if(missing.length)throw Error('Missing report files: '+missing.join(','))
console.log(JSON.stringify({ok:true,version:16,links:links.length,report:'reports/l11-reference/index.html'}))
