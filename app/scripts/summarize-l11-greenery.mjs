import {readFileSync,writeFileSync,copyFileSync,existsSync,statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const app=fileURLToPath(new URL('../',import.meta.url)),root=path.join(app,'reports/l11-reference')
const read=file=>JSON.parse(readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''))
const write=(file,value)=>writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n')
const label='greenery-v15-verified',compatLabel='greenery-v15-low-classic'
const r=read(`${label}/runtime.json`),compat=read(`${compatLabel}/runtime.json`),audit=read('inspection/notes.json')
for(const [name,data]of [[label,r],[compatLabel,compat]]){
  if(!data.ok||data.errors.length||!data.command.includes('--headless=new')||!data.cleanup.profileRemoved||!read(`${name}/process-cleanup.json`).cleanupConfirmed)throw Error('Incomplete runtime / cleanup: '+name)
}
if(r.setup.version!==15||!r.greenery?.ok||r.cycles?.length!==3||r.random?.length!==2||!compat.low||compat.mode!=='classic'||compat.cycles?.length!==3||compat.cycles.some(c=>!c.foliageCache||c.foliageCache.bytes>c.foliageCache.maxBytes))throw Error('Missing final v15 coverage')
const snapshots=[['../l11-remake/mesh-check.json','meshes.json'],['architecture/static.json','architecture.json'],['../l11-water-collision/static-collision.json','collision.json'],['greenery-check.json','greenery.json'],['inspection/notes.json','reference-observations.json']]
for(const [source,target]of snapshots)copyFileSync(path.join(root,source),path.join(root,label,target))
copyFileSync(path.join(app,'assets/l11-bark/manifest.json'),path.join(root,label,'bark-assets.json'))
const mesh=read(`${label}/meshes.json`),arch=read(`${label}/architecture.json`),greenery=read(`${label}/greenery.json`)
if(mesh.buildings!==30||mesh.decor!==103||!arch.ok||!arch.quayBeds||greenery.assetFiles!==6||greenery.geometries!==16)throw Error('Incomplete final static evidence')
const checks=[['build','build','✓ built in'],['check:l11-greenery','greenery','"geometries": 16'],['check:l11-architecture','architecture','"quayBeds":'],['check:l11-meshes','meshes','"uniqueTextures"'],['check:l11-props','props','"placements": 17634'],['check:l11-collision','collision','L11 collision checks passed']].map(([command,key,marker])=>{
  const source=path.join(root,`v15-${key}.log`)
  if(!readFileSync(source,'utf8').includes(marker))throw Error('Missing static success: '+key)
  copyFileSync(source,path.join(root,label,`${key}.log`))
  return {command:'npm run '+command,status:'passed',log:`${key}.log`,completed:statSync(source).mtime.toISOString()}
})
const commands=[
  `node scripts/verify-l11-reference.mjs --label=${label} --case=01,03,14,22,31,32,43,44 --validate=east-stone,quay-east-near --architecture --random-cases=twins,garden --greenery --lifecycle`,
  `node scripts/verify-l11-reference.mjs --label=${compatLabel} --case=01,44 --low --classic --visual-only --greenery --lifecycle`,
]
const changes=[
  '行道树改成相连的浅灰分叉树干、细枝与宽幅修剪叶冠；补齐树皮 CC0 颜色、OpenGL 法线和独立粗糙度通道。原始纹理不改，运行时按参考调整颜色，没有噪点纹理。',
  '大楼梯旁的围栏花园及双塔水岸前庭使用连续种植带。布置随建筑入口方向和退界旋转，避让楼梯、步行通道与其他室外道具，普通城市也使用同一规则。',
  '修正建筑叶冠误用半尺寸、矮灌木叶片稀疏和双面法线翻转；近景细枝连接种植面与叶冠，远景保留相同种植带轮廓。',
  '修正精细渲染模型将非实体细枝误收进碰撞的问题。花坛墙体和压顶可碰撞，树干与主枝可承接下落；叶片和灌木细枝不产生空气墙。',
  '为可变尺寸叶冠的源几何缓存设置 96 项／32 MiB 上限，超限回收最久未使用的数据；已经合批的场景模型保持有效。',
]
const remaining=[
  '照片没有米制尺寸、完整室内平面或连廊内部。树种、分枝数量、柱宽、楼高、后部房间和隐藏细枝均属建模推定，不能称实测复原。',
  '店铺商品、海报图案和照明密度、连廊面板比例与金属连接件仍需继续还原；看不清的文字没有擅自补写。',
  '树冠形状已调整，但枝叶密度、叶片尺度、剪修边缘仍有差异；长种植带近看还能看出规则分布。',
  '当前街道纵深、建筑体量、幕墙反射、铺装与整体光照仍与照片存在明显差距，不能宣布几乎完全一致。其他七张图保留逐项观察记录，尚未全部完成实机对照。',
  '本轮低画质／经典光照覆盖两个视角、绿化碰撞、移动与三次重载，未重跑全部室内。移动有长帧，尚未达成所有场景稳定 60 FPS。',
]
const parts=[
  ['店铺朝向与转角','两侧玻璃店面共用实体柱网；横招位于柱间、圆形挑牌固定在柱上。','14-storefront-corner','可透视与门前通行已保留，货架和广告细节仍待还原。'],
  ['右前方入口','宽直梯，两侧扶手、灰墙与围栏花园；种植体不进入踏步。','43-garden-street-side','宽度和完整级数为推定。'],
  ['行道树与街面位置','树干在路缘内侧；主干分叉，冠幅宽且有修剪轮廓。','01-office-street','树种及精确尺寸不能从照片确认。'],
  ['双塔侧面与顶部连接','相向蓝色立面属于两栋楼；楼间空间在顶端由实体连廊连接。','31-roof-link-oblique','底面有板缝；面板比例及连接节点仍有差异。'],
  ['滨水台阶与种植带','连续挡墙托住绿化，分置台阶两侧；前方岸道开放。','44-quay-planting','种植带沿立面旋转，实际细枝不阻挡。'],
  ['运河桥、桥墩与岸栏','真实缓拱、实体桥板和桥墩；岸边石柱间为细金属栏片。','03-canal','既有 v13 结构回归通过；桥梁细部尚未逐一复刻。'],
]
const history=[
  ['greenery-v15-draft','首轮：树冠稀疏、树皮偏棕。'],
  ['greenery-v15-light','调整树皮与叶片法线；连续绿化尚未修正。'],
  ['greenery-v15-final','8 个视角与完整通行检查通过，但侧视发现灌木悬空。'],
  ['greenery-v15-grounded','补齐落地细枝后，下落检查暴露精细渲染的碰撞标记问题；该轮失败记录保留。'],
]
const compact=data=>({version:data.setup.version,seed:data.seed,newGameSeed:data.setup.newGameSeed,low:data.low,mode:data.mode,views:data.views,greenery:data.greenery,validation:data.validation,ordinary:data.random,shop:data.inspected,civil:data.civil,walking:data.walking,streamTimings:data.streamTimings,cycles:data.cycles?.map(c=>({memory:c.memory,nonPooledTextures:c.nonPooledTextures,cachedAvatarTextures:c.cachedAvatarTextures,geometryAudit:c.geometryAudit,buildings:c.buildings,references:c.references,roots:c.roots,foliageCache:c.foliageCache})),browser:data.browser.product,hardware:data.hardware,errors:data.errors,networkErrors:data.networkErrors.map(e=>e.response?{url:e.response.url,status:e.response.status}:{url:e.url,error:e.errorText}),cleanup:data.cleanup})
write(`${label}/checks.json`,{version:15,checks})
write(`${label}/acceptance.json`,{version:15,changes,parts,remaining,checks,commands,history,final:compact(r),compatibility:compact(compat),comparison:'Camera poses are fixed; runs with different asset residency are not controlled before/after performance measurements.'})
const n=v=>Number(v).toFixed(1),regions=audit.sources.reduce((n,s)=>n+s.regions.length,0)
const md=`# Level 11 位置、朝向与绿化细节复核（参考版本 15）

[原图和实机对照](index.html) · [原像素放大](inspection/index.html) · [本轮数据](${label}/acceptance.json) · [v14 店铺与连廊](README-v14.md)

${changes.map(v=>'- '+v).join('\n')}

## 检查范围

L11 种子 **${r.seed}**／新游戏种子 **${r.setup.newGameSeed}**，1920×1080、DPR 1。高画质真实光照包含 ${r.views.length} 个固定视角，额外检查普通种子的双塔和围栏花园。低画质经典光照包含 ${compat.views.length} 个相同机位。原图观察页共 ${audit.sources.length} 张原图、${regions} 个局部；按原像素放大，没有 AI 补细节。

${parts.map(([part,done,,gap])=>'- **'+part+'**：'+done+' '+gap).join('\n')}

## 验证结果

静态检查采样 ${arch.buildings} 栋普通城市建筑，出现全部 ${Object.keys(arch.recipes).length} 种参考配方，含 ${arch.quayBeds} 段连续滨水种植带；模型库 ${mesh.buildings} 种建筑、${mesh.decor} 种装饰。树皮 6 个资产的真实尺寸、MD5 与上游元数据吻合；16 组叶冠几何检查覆盖完整边界、叶片 UV 和缓存。标牌、普通道具的旋转碰撞及摆放检查通过。装饰原型数量未用换色或枝叶变体重复计数。

实机通过树干阻挡／主枝落地、花坛墙体／顶部落地、叶片与细枝非实体、两栋入口及楼梯、店门双向通行、拱桥／桥墩、外梯、岸道和普通世界回归。三次卸载重载通过，几何计数 ${r.cycles.map(c=>c.memory.geometries).join('/')}，非角色池纹理 ${r.cycles.map(c=>c.nonPooledTextures).join('/')}，角色池纹理 ${r.cycles.map(c=>c.cachedAvatarTextures).join('/')}；这些是资源计数，不是显存字节数。高画质运行完成后补上叶冠源几何缓存上限；几何生成算法未改，缓存回收用静态压力检查和低画质／经典光照的三次重载另外验证，后者缓存字节数 ${compat.cycles.map(c=>c.foliageCache.bytes).join('/')}。

浏览器 **${r.browser.product}**，显卡 **${r.hardware.renderer}**。完整移动采样中位数 ${n(r.walking.median)}ms、P95 ${n(r.walking.p95)}ms、最长 ${n(r.walking.max)}ms；采样末绘制调用 ${r.walking.draws}、三角形 ${r.walking.triangles}。不同运行的驻留场景不同，不将其解释为受控性能对比。运行错误 0；网络日志见 runtime.json。所有 QA 使用真正 --headless=new、独立端口与 profile，已清理，并用只读进程／监听端口检查独立复核。

## 仍待还原

${remaining.map(v=>'- '+v).join('\n')}

## 保留的迭代记录

${history.map(([name,note])=>'- ['+name+']('+name+'/runtime.json)：'+note).join('\n')}

## 可复跑命令

工作目录 app：

\x60\x60\x60text
${checks.map(c=>c.command).join('\n')}
${commands.join('\n')}
./scripts/check-l11-qa-cleanup.ps1 -Labels '${label}','${compatLabel}'
node scripts/inspect-l11-references.mjs
node scripts/build-l11-inspection-report.mjs
node scripts/summarize-l11-greenery.mjs
\x60\x60\x60

构建仍有既有的大包、字体路径及静态／动态导入提示。资产来源及运行时加工见 [L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。
`
writeFileSync(path.join(root,'README.md'),md)
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const pic=(file,title)=>{if(!existsSync(path.join(root,file)))throw Error('Missing image: '+file);return `<figure><a href="${file}" target="_blank"><img src="${file}" alt="${esc(title)}" loading="lazy"></a><figcaption>${esc(title)}</figcaption></figure>`}
const card=(file,title,note)=>`<article><h3>${esc(title)}</h3>${pic(file,title)}<p>${esc(note)}</p></article>`
const compare=(source,id)=>`<div class="grid">${card('../../reference/L11/'+source,'原图 '+source,'点击可查看完整原图；局部放大及未知项见原像素观察页。')}${card(label+'/'+id+'.png','当前实机 · '+id,'保持已有相机和画质；真实三维场景，可从其他角度检查。')}</div>`
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L11 逐项对照 · v15</title><style>body{margin:0;background:#111923;color:#e7edf1;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:24px}a{color:#8fcfff}nav{position:sticky;top:0;padding:12px;background:#111923ee;z-index:2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,450px),1fr));gap:20px}article,figure{margin:0}article{padding:16px;border:1px solid #34495d;border-radius:8px;background:#192532}img{display:block;width:100%;height:auto}figcaption{font-size:13px;color:#acbac7}h2{margin-top:36px}.notice{border-left:4px solid #d1a567;background:#30291f;padding:14px}li{margin-bottom:8px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:12px;border:1px solid #34495d;text-align:left}.scroll{overflow:auto}</style><main><h1>Level 11 · 位置、朝向与绿化细节 v15</h1><p>L11 种子 ${r.seed}／新游戏种子 ${r.setup.newGameSeed}。逐项记录能看见的细节和不能确认的部分。</p><nav><a href="inspection/index.html">原像素放大</a> · <a href="#street">街道与店铺</a> · <a href="#canal">运河与连廊</a> · <a href="#parts">逐项核对</a> · <a href="README.md">检查与命令</a> · <a href="index-v14.html">v14 报告</a></nav><p class="notice">仍在还原中，尚未达到与照片几乎完全一致。实机通行检查通过不等于视觉验收完成；未看清的文字、照片未展示的内部和米制尺寸不作确定结论。</p><ul>${changes.map(v=>'<li>'+esc(v)+'</li>').join('')}</ul><h2 id="street">11iconic · 街道、店铺与入口侧面</h2>${compare('11iconic.jpg','01-office-street')}<div class="grid">${card(label+'/14-storefront-corner.png','店铺玻璃、柱体与门头','保留真实室内与两面转角玻璃。店名、挑牌和实体柱的位置延续 v14；商品和广告仍待逐项还原。')}${card(label+'/43-garden-street-side.png','从街侧检查花园和宽楼梯','绿化在灰墙／栏杆后连续布置，树位于步道侧；种植体与土面连接，关键通道保持开放。')}${card('inspection/tree-pruning.png','原图局部 · 树干和冠幅','直接原像素裁剪。浅灰分叉、较平整的修剪轮廓可以观察；植物种类和精确尺寸无法确定。')}${card(label+'/22-grand-entrance.png','入口正面及上方空间','台阶、扶手和抬高首层在另一角度保持一致。')}</div><h2 id="canal">11canal · 体量、连廊、台阶与连续种植带</h2>${compare('11canal.png','03-canal')}<div class="grid">${card(label+'/31-roof-link-oblique.png','楼间向上检查连廊','顶端连接两栋楼，底面有分缝；并非在两楼之间另加一栋蓝楼。')}${card(label+'/32-waterside-steps.png','从侧面看临水宽台阶','台阶、平台、扶手和岸道沿真实建筑入口组织。')}${card(label+'/44-quay-planting.png','沿岸种植带近景','连续挡墙、压顶、土面、细枝与叶冠；花坛避让楼梯，普通城市共用配方。')}${card('inspection/canal-roof-link.png','原图局部 · 连廊与蓝色侧面','保留参考的蓝板、中央深色区域、红色细横条及灰绿框格记录；比例仍需继续对照。')}</div><h2 id="parts">逐项核对与剩余差异</h2><div class="scroll"><table><thead><tr><th>部分</th><th>当前结构与相对位置</th><th>仍不能视为完成</th></tr></thead><tbody>${parts.map(([part,done,id,gap])=>`<tr><td><a href="${label}/${id}.png">${esc(part)}</a></td><td>${esc(done)}</td><td>${esc(gap)}</td></tr>`).join('')}</tbody></table></div><h2>普通世界与兼容档</h2><div class="grid">${card(label+'/random-twins.png','普通种子 · 双塔与顶部连廊','同一配方也在随机城市生成；普通建筑朝向、入口与外部通行通过检查。')}${card(label+'/random-garden.png','普通种子 · 围栏花园','楼梯两侧绿化沿入口方向布置，未绑定示例种子。')}${card(compatLabel+'/01-office-street.png','低画质／经典光照','同一固定相机，保留树干和种植带轮廓；本轮仅做两个视角的兼容复查。')}</div><h2>实际游戏验证</h2><p>构建、模型、建筑、绿化、旋转碰撞和道具摆放检查通过。真正无头 Chrome，运行错误 0，完整移动与三次重载通过。移动 P95 ${n(r.walking.p95)}ms、最长 ${n(r.walking.max)}ms，仍有长帧。<a href="${label}/acceptance.json">浏览器、硬件、帧时间及检查数据</a> · <a href="${label}/process-cleanup.json">进程清理复查</a></p><ul>${remaining.map(v=>'<li>'+esc(v)+'</li>').join('')}</ul><details><summary>迭代历史（含失败记录）</summary><ul>${history.map(([name,note])=>`<li><a href="${name}/runtime.json">${name}</a>：${esc(note)}</li>`).join('')}</ul></details></main></html>`
writeFileSync(path.join(root,'index.html'),html)
console.log('L11 v15 report written with final, compatibility and failed-iteration evidence.')
