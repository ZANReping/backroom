"""Rebuild the Traders Keep QA figures and report from saved production-game runs."""
from pathlib import Path
import argparse, json, hashlib
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
out=root/'reports/traders-keep'
cli=argparse.ArgumentParser()
cli.add_argument('--real',default='traders-dressing-verified-20261021')
cli.add_argument('--classic',default='traders-dressing-classic-verified-20261021')
args=cli.parse_args()
real=json.loads((out/args.real/'runtime.json').read_text(encoding='utf-8-sig'))
classic=json.loads((out/args.classic/'runtime.json').read_text(encoding='utf-8-sig'))
audit=json.loads((out/'dressing-audit-20261021.json').read_text(encoding='utf-8-sig'))
checks=json.loads((out/'dressing-regressions-20261021.json').read_text(encoding='utf-8-sig'))
bench=json.loads((out/'dressing-bake-benchmark-20261021.json').read_text(encoding='utf-8-sig'))
assert real['ok'] and classic['ok'] and audit['ok'] and all(c['exit']==0 for c in checks)
fontfile=Path('C:/Windows/Fonts/msyh.ttc')
font=lambda size:ImageFont.truetype(str(fontfile),size) if fontfile.exists() else ImageFont.load_default()
def figure(name,title,subtitle,cells,cols=3):
    w,h,bar,gap=640,360,34,12
    rows=(len(cells)+cols-1)//cols
    canvas=Image.new('RGB',(cols*w+(cols+1)*gap,88+rows*(h+bar+gap)),(22,27,25))
    draw=ImageDraw.Draw(canvas)
    draw.text((gap,12),title,font=font(26),fill=(232,231,217))
    draw.text((gap,52),subtitle,font=font(16),fill=(177,190,180))
    for i,(path,label) in enumerate(cells):
        x=gap+(i%cols)*(w+gap);y=88+(i//cols)*(h+bar+gap)
        with Image.open(path) as im: canvas.paste(im.convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(x,y))
        draw.text((x+6,y+h+5),label,font=font(16),fill=(225,226,215))
    canvas.save(out/name,optimize=True)

labels={'west-waiting':'西门候场与行李','arrival-guide':'入口导览','bank-layout':'公共服务大厅','archive-detail':'档案与文件','copy-detail':'复印和邮件','tea-detail':'茶水间与电器','food-court':'美食广场','tray-return':'餐盘回收','wash-basins':'双盆洗手台','wash-cubicles':'卫生间隔间','office-detail':'办公工位','office-layout':'办公室布局','monitor-room':'监控与值勤','security-desk':'警备工位','meeting-room':'会议室','dorm-bed':'宿舍与床头','packing-bench':'后勤打包工作台','vault-storage':'普通库房','cold-storage':'冷藏库房'}
overview=['west-waiting','bank-layout','tea-detail','wash-basins','packing-bench','archive-detail','office-detail','dorm-bed','vault-storage']
figure('dressing-overview-20261021.png','商人之家 · 公共与生活区内饰','实际游戏截图；仅缩放排版，无补画、调色或参考照片背景',[(out/args.real/(n+'.png'),labels[n]) for n in overview])
previous=out/'traders-fitout-visual-final-20261021'
paired=[]
for old,new,label in [('waiting-final','west-waiting','西门候场'),('bank-final','bank-layout','公共服务'),('workstation-final','office-detail','办公工位')]:
    paired.extend([(previous/(old+'.png'),'上一轮已交付 · '+label),(out/args.real/(new+'.png'),'本轮追加细化 · '+label)])
figure('dressing-before-after-20261021.png','相同机位对照','左：此前已交付内饰；右：本轮。不是同轮硬件性能基线。',paired,2)
figure('dressing-ceiling-fix-20261021.png','吊顶高差封边修正','相同实际场景和机位；修复角点误判引起的三角尖片',[(out/'traders-dressing-edge-audit-20261021/tray-return.png','修正前'),(out/args.real/'tray-return.png','修正后')],2)

ui=real['app']; samples=ui['samples']
summary={'realRun':args.real,'classicRun':args.classic,'newPlacements':audit['dressing'],'reworkedObjects':289,'modelIssues':audit['issues'],'modelOverlaps':audit['overlaps'],'regressionPasses':len(checks),'actualUiChecks':len(ui['checks']),'realViews':len(real['dressing']['rows']),'classicViews':len(classic['dressing']['rows']),'frameSamples':samples,'entry':ui['entry'],'teleports':[{k:v[k] for k in ('name','loadMs')} for v in ui['views']],'resourceCycles':ui['cycles'],'resourceDrift':ui['drift'],'runtimeErrors':real['errors'],'networkErrors':[e.get('response',{}).get('url',e) for e in real['networkErrors']],'cleanup':{'real':real['cleanup'],'classic':classic['cleanup']}}
(out/'dressing-summary-20261021.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
bake_count=sum(audit['counts'].get(n,0) for n in ['storageRack','palletLoad','coldcabinet','bedkit','conference'])
assert bake_count==289
shotrows='\n'.join(f"| {labels[v['label']]} | {v['x']:.2f}, {v['y']:.2f} | {v['yaw']:.3f} / {v['pitch']:.3f} | [真实]({args.real}/{v['label']}.png) · [经典]({args.classic}/{v['label']}.png) |" for v in real['dressing']['rows'])
sample_rows='\n'.join(f"| {i+1} | {s['medianMs']:.2f} | {s['p95Ms']:.2f} | {s['calls']} | {s['triangles']} |" for i,s in enumerate(samples))
checkrows='\n'.join(f"| {c['check']} | 通过 | [{Path(c['log']).name}]({Path(c['log']).name}) |" for c in checks)
teleportrows='\n'.join(f"| {v['name']} | {v['loadMs']/1000:.2f} s |" for v in ui['views'] if v['name'] in ['service-hall','vault-corridor','food-court','logistics','office','dormitory','vault-door'])
fence=chr(96)*3
text=f"""# 商人之家公共与生活区追加细化 · 2026-10-21

本轮已在原项目 E:/ZAN/backroom/app 加入 **224 组**内饰布置，并细化 **289 件**库房、后勤及住宿家具。贴墙设施、桌面小物、坐姿/屏幕朝向和吊顶过渡均做了数据与实际画面检查。修改保留 420×276 米单层规划和原有业务、权限、物品及存档。

[实现说明](../../TRADERS-KEEP-REMAKE.md) · [来源与许可](../../TRADERS-KEEP-SOURCES.md) · [实际游戏完整结果]({args.real}/runtime.json) · [经典取景结果]({args.classic}/runtime.json) · [机器可读摘要](dressing-summary-20261021.json)

## 内饰安排

| 空间 | 本轮具体变化 |
|---|---|
| 三处入口、中庭与公共服务 | 靠墙导览、公共电话、挂钟、消防柜/灭火器/卷管、急救柜、取号机、入口地垫、行李箱和补充排椅。 |
| 银行、办公室、会议与警备 | 档案架、复印机及纸盒、邮件格柜、茶水台、25 个工位隔屏、白板、电话、插座、暖气、衣帽架与休息软座；监控墙有地图/值班/记录分区，会议椅面向桌子。 |
| 美食广场 | 两处餐盘回收台、少量杯具/纸本、茶水及卫生/消防设施；就餐和回收动线留出净空。 |
| 两处分拣中心 | 打包工作台、真实比例穿孔工具板、扳手/螺丝刀/刀具/钳子、胶带、工单、邮件格柜、清洁推车和设备柜。 |
| 两处卫生间 | 六个隔间、四组双盆台、四个小便器及清洁车。实际台面开孔、盆体/排水、龙头、皂液、镜框和落地马桶。 |
| 宿舍 | 24 套床架/床垫/枕头/毯子/床下鞋，12 个床头柜，以及行李、值班和茶水设施。 |
| 库房与后勤存储 | 117 个带横撑/层板/标签箱件的货架，119 组带叉孔/木条/绑带的托盘，28 个带保温盖/把手/通风/温度面板的冷藏箱。 |

28 个沿街铺位、四个主力店维持空铺；未开通铁路与补给码头未新增内饰或业务。新增装饰没有挂接无意义的“贸易设施”交互。

![本轮九处实际场景](dressing-overview-20261021.png)

## 模型、贴图与摆放修正

- 墙挂设施依据完整实墙定位，检查墙段身份、正面法线和 8 mm 安装间距。三处缺少完整背墙的候选跳过，未强行塞入门洞。
- 旋转家具保留局部宽深，生成对应的世界包围盒与分件碰撞。新增家具避让实际人物岗位及路线。
- 会议椅、仓储正面、办公屏幕与柜台终端分别朝向使用者；包裹推车轮轴、电话键盘/线缆、时钟朝向同步检查。
- 纸本、文件夹、床毯、杯子和胶带落在真实支撑面。杯具具有内壁，液面低于杯口；盆台有实际圆孔和空壳柜体，不用填满的盒子穿过盆体。
- 微波炉使用门框/网孔/把手/旋钮，咖啡机有滤斗/杯壶/底座；工具板与微波炉孔纹重复到物理尺度，并合入同一材质批次。
- 复用项目已有 CC0 水磨石、钢材、木材、纸板及织物扫描。新增 1024² 颜色与各 512² 法线/粗糙度共享图集，含导览、消防、值班、档案、终端、条码等 16 格，保留扩边和 mipmap。
- 图集由可重现 Pillow 脚本绘制，没有外部位图或 AI 图像步骤；印刷表面用平法线。具体作者/许可、资产路径与 SHA-256 见[图集记录](../../public/textures/traders/DRESSING-SOURCES.md)及[扫描材质来源](../../TRADERS-KEEP-SOURCES.md)。
- 镜面为低成本环境反射近似；没有新增实时镜面捕获、折射、场景灯或后处理通道。

![相同机位前后对照](dressing-before-after-20261021.png)

左图是此前已交付版本的实际取景，右图为本轮相同种子/机位；仅作视觉对照，不作为同设备同轮性能基线。

## 尖片与远处露空

实际画面复核发现餐盘回收区上方的黑色尖片。几何射线和法线诊断确认：吊顶高差封边在网格端点读到了侧方矮顶区域，生成了本不应存在的三角片，且封边法线与绕序不一致。现在按边段内部判断邻区，只闭合真实高差；补充回归断言，并在原机位重拍。法线图仅用于诊断，没有用作验收材质。

![尖片修正前后](dressing-ceiling-fix-20261021.png)

建筑与家具现在由独立队列准备：真实墙门可见性优先决定建筑就绪，近处家具随后完成，避免远墙被前一区块家具构建阻塞。查询只对轻量二维墙门数据工作，不渲染假墙，也不把尚未加载当作无遮挡。

关闭库房的内部装饰在距门 4 米、开门或玩家已经在室内时准备；稳定 ID、物理碰撞、物品与权限记录仍存在。新批次预热完成后整体替换，保留原门动画进度。卷帘上升高度按自身门洞计算，门板留在卷筒附近，实际净高超过 2.1 米。

## 人物、功能与兼容检查

保持六名联系人及 154 名职业居民、42 个坐姿岗位；附近活动上限 32。固定岗位人物在实际取景中没有漂离 home 点，数据检查另外覆盖通路、墙体/家具冲突及 60 秒活动。新增设施避让这些岗位和巡逻路线。

完整真实 UI 检查共 **{len(ui['checks'])} 项通过**，包含首次西门进入、各区安全传送、卷帘交互/碰撞/动画、地图拖动与右键传送、远处区块回收、重复往返、带物品/仓库/任务进度的存读档、旧布局迁移、返回口和新开局清理。画质检查另外覆盖经典/真实、高低纹理、过期构建取消、隐藏碰撞代理与资源释放。详细断言保存在完整结果 JSON 中。

模型审计通过：有限几何/UV、旋转尺寸、正面朝向、完整背墙、独立几何/共享材质寿命、盆孔实际射线、卷帘净高、方向探针插值及吊顶高差。本轮新增物件的审计冲突为 0；这不代表人工检查了每个随机人物的每一帧。

## 最终取景参数

实际生产 Engine/Renderer，层级 102；渲染夹具种子 424242，1920×1080、DPR 1、原生分辨率，垂直 FOV 72°、正常眼高。yaw/pitch 为弧度；x/y 为游戏平面坐标。关闭颗粒/晃动，固定岗位按真实 NPC 更新；仅在验收夹具里提前打开两个待拍库门，不修改玩家存档。真实 UI 流程另使用该开局衍生的地图种子 {ui['saved']['mapSeed']}，记录在结果中。

| 取景 | x, y | yaw / pitch | 实际原图 |
|---|---|---|---|
{shotrows}

## 性能与仍未达标项

测试为 RTX 4060 Laptop、1080p 桌面真无头 Chrome；真实光影、高纹理、16 场景灯、阴影开启、泛光开启、AO 1，加载预算 6 ms / 普通流式预算 3 ms。以下为预热和跨区往返后的相同西入口机位五轮；不是全据点最坏情况，也不是 Android 实测。

| 轮次 | 帧时间中位数 ms | P95 ms | 绘制调用 | 三角面 |
|---|---|---|---|---|
{sample_rows}

三次跨区回收再返回后均为 {ui['cycles'][0]['memory']['geometries']} 个几何、{ui['cycles'][0]['memory']['textures']} 张纹理，最终漂移为 {ui['drift']['geometries']} / {ui['drift']['textures']}。该路径五轮达到中位数 ≤16.7 ms、P95 ≤20 ms；不能据此宣布所有区域性能达标。

冷渲染进入 {real['cases'][0]['cold']['loadMs']/1000:.2f} s；实际 UI 进入就绪 {ui['entry']['readyMs']/1000:.2f} s、可操作 {ui['entry']['playableMs']/1000:.2f} s。长距离开发者传送仍可能明显超过十秒：

| 目标 | 实际就绪时间 |
|---|---|
{teleportrows}

**进入/跨区全部十秒以内的目标尚未全面达到。** 最慢的密集库区仍需后续继续优化构建与预热。没有以降低可见就绪标准、截图通过或较早更快的一轮数据代替这个结果。

细小家具采用六方向受光探针；长窄家具使用长度/高度各三点的方向探针网格，建筑保留逐顶点取样。同一生产货架的五轮独立 CPU 烘焙对照中位数为 {bench['vertexMedianMs']:.2f} → {bench['probeMedianMs']:.2f} ms；它是受光近似，原始对照的最大/RMS 颜色属性差为 {bench['rounds'][0]['maxDifference']:.3f}/{bench['rounds'][0]['rmsDifference']:.3f}，不声称数学等价或游戏 FPS 提升 {bench['speedup']:.1f} 倍。[CPU 原始数据](dressing-bake-benchmark-20261021.json)。

## 构建、回归及复现

生产构建通过，保留既有 bundle 大小提示：[构建日志](dressing-build-20261021.log)。

| 检查 | 结果 | 日志 |
|---|---|---|
{checkrows}

真实和经典运行均 0 条浏览器运行错误。仅有 favicon.ico 的 404，没有贴图/模型加载失败；原始网络事件保留在结果 JSON。两个验收浏览器都明确使用 --headless=new、独立端口和配置目录，结束后回收自身浏览器、服务器与配置目录；没有连接或关闭用户浏览器。

{fence}powershell
cd E:\\ZAN\\backroom\\app
python scripts/generate-traders-dressing.py
npm run check:traders-dressing
npm run check:traders-visibility
npm run check:traders-fitout
npm run check:traders-keep
npm run check:traders-gates
npm run check:settlements
npm run check:outpost-colliders
npm run check:settlement-assets
npm run check:static-batch-job
npm run check:model-warmup
npm run check:seating
npm run check:program-completion
npm run build
node scripts/verify-traders-keep.mjs --label={args.real} --quality --dressing
node scripts/verify-traders-keep.mjs --label={args.classic} --classic --renderer-only --dressing
python scripts/report-traders-dressing.py
{fence}

生产源模块分别位于 content/tradersDressing.ts、tradersDressingShapes.ts、tradersFurnishings.ts，以及 renderer/tradersDressingMeshes.ts、tradersLivingProps.ts、tradersWallFixtures.ts、tradersDressingParts.ts、tradersStream.ts、tradersVisibility.ts、tradersMeshes.ts、tradersBakedLighting.ts。几何、材料、照明与碰撞均为正常游戏共用实现。
"""
(out/'DRESSING.md').write_text(text,encoding='utf-8')
print(json.dumps({'report':str(out/'DRESSING.md'),'figures':3,'uiChecks':len(ui['checks']),'realViews':len(real['dressing']['rows']),'classicViews':len(classic['dressing']['rows'])},ensure_ascii=False))

