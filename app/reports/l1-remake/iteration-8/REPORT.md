# Level 1 第八轮：机位画幅、陈设与箱堆

本轮继续以游戏中的真实建筑和物品校准参考，不把点投影通过当作整幅还原完成。上轮基线保留在 `../iteration-7/`；本轮未复制旧截图充当新结果。

## 相机与画幅

逐一读取十八张源图的真实尺寸并加入自动检查。原记录中的小径走廊、小径房间、板条箱及停电图尺寸有误；其中箱子由错误的横幅改为 467×529 竖幅，停电图改为 1000×633。相同比例的两张小径图仅修正像素元数据。

箱堆使用四个外轮廓对应点重新拟合位置、朝向、俯仰、FOV 和滚转。陈设场景增加左右近柱脚标记，纠正此前后墙标记落在墙背面的问题；第一次自动拟合出现约 4° 的不自然滚转，已否决，依据参考近水平的后墙约束滚转和偏航后重新拟合。每张最终截图保留实际渲染器相机参数，叠加图不做后期配准或色彩匹配。

本轮改变了标记数量与对应关系，不能把与上轮的通过点数差当作整体相似度提升百分比。拟合仍存在相机与场景尺度的歧义，稀疏标记不证明未标记的梁、灯、管线也已吻合。

## 世界与模型

- 天鹰陈设场景重设左右柱网，使用真实砖后墙、两道管线和后墙灯。后墙灯与烘焙共享位置、功率；减少前景补光，保留暗前景。桌子、三把椅子、两块百叶板和灭火器在建筑完成后放置；相同陈设组合也用于合适的普通种子墙边，防止旧地图流程提前丢失家具。
- 圆柱天鹰右侧改为连续实墙，以墙灯为主。原来露出的额外柱列被真实墙体遮挡，几何、碰撞与烘焙同时更新。
- 板条箱宽 1.28m、深 0.71m、高 0.68m，增加两层堆放。普通箱位按确定性 13% 选择堆叠，展示箱为下层 1、上层 11；整垛仍是一份货物库存，保留原 sid、搜刮及存储内容，不因上层模型增加补给。每实例合并至三批次，不超过 700 三角面。
- 印字改为共享运输标记图集，修复格间串色、字形横向拉伸和贴面深度争用。木材继续使用原有 CC0 Wood051；砖墙继续使用 CC0 Painted Brick。具体来源、作者、许可和处理见 `../../../public/textures/l1/SOURCES.md`。
- 两处建筑的 18 个烘焙区块已重新发布，并解压校验全部 162 份现存烘焙数据的版本及当前建筑指纹。烘焙结果不写入玩家存档。

## 验证范围和限制

静态检查覆盖十八图尺寸、693 个区块的落点、真实生成器的堆叠确定性和库存 ID、单/双层模型尺寸及释放、陈设是否被旧放置流程搬走，以及低档烘焙 UV/有限值/接缝。生产构建通过。首次沙箱 Vite 无法被独立 Chrome 访问，首次构建遭遇 realpath EPERM；错误日志保留，随后在授权的验证进程环境重试。

重点场景仍未完整匹配：箱子缺少参考中的后方堆箱与倚板，木纹的材种/纹路尺度仍不同；陈设场景的上方管线、桌椅细节和投影有差异；圆柱天鹰的顶面服务管线、纵深、地面细节和原生物资位置仍不一致。其余参考中此前记录的哥特拱曲率、湿区、花园密度、施工细节及移动长帧仍未因此关闭。

## 复现

工作目录 `app`，展示种子 `20261006`。本聊天使用 Vite 3013、独占 Chrome CDP 9264 和 `.cache/l1-qa-chrome-9264`，实际启动参数包含 `--headless=new`。未使用内置浏览器。

```powershell
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3013 --strictPort
# 独立终端：
$env:L1_QA_URL='http://127.0.0.1:3013'
$env:L1_QA_CDP='9264'
$env:L1_QA_REPORT='iteration-8/final'
$env:L1_QA_ITERATION='iteration-8'
node scripts/verify-l1-detail-runtime.mjs capture
$env:L1_QA_ANCHORS='parking-props,parking-round,crate'
node scripts/verify-l1-detail-runtime.mjs refinement
node scripts/verify-l1-detail-runtime.mjs classic
node scripts/compare-l1-v4.mjs
node scripts/summarize-l1-v4.mjs
npm run check:l1-props
npm run check:l1-room-dressing
npm run check:l1-bake
npm run check:l1-offline
npm run build
```

额外检查入口：`scripts/check-l1-crate-stack.ts`、`check-l1-v4-placement.ts`、`check-l1-reference-aspects.mjs`，按既有 esbuild Node 打包方式运行（涉及 canvas 的脚本使用 `--external:@napi-rs/canvas`）。实际命令输出保存在 `static-checks.log`、`build.log`。

## 本轮实测结论与修复回归

十八张参考截图已全部生成。稀疏标记为 46/48 点在 3% 内；哥特段仍有两点超标，整体外观也未达到参考。`final/runtime.json` 的 39 项单机机制、`final/v4-runtime.json` 的 14 项照明/存档检查、`final/bake-transport.json` 的 9 项传输/缓存检查通过。

三处重点场景均完成五轮性能采样，结果见 `PERFORMANCE.md`。最差轮 P95：陈设天鹰 66.7ms、圆柱天鹰 79.2ms、箱子 54.2ms，均未达到 20ms 目标；不能把脚本成功执行视作性能验收通过。完整 capture 在十八图之后的首个普通种子冷加载超过 120s，失败和队列状态保存在 `final/failure-capture.json`，未将其改报为通过。

经典模式暴露了另一个真实错误：箱子附近仓库区块有 7312–7453 个表面，最低采样密度仍装不下带留边的 256² 图集，抛错后停止绘制。修复保留已有成功布局；仅对此前溢出的布局按贴图块高度重排，必要时扩容，尺寸上限 1024。`atlas-capacity.json` 检查 462 组高低档布局的留边、不重叠及尺寸，实际仅三份低档扩至 512²，并验证重复烘焙相同、UV 有限且不越界。既有成功结果没有改变，因此无需作废全部 r10 缓存；失败任务本身不会写入缓存。

修复后 `classic-retry/result-classic.json` 中陈设天鹰、圆柱天鹰、箱子三处实际无头 Chrome 回归通过，运行错误及控制台错误均为 0。已人工查看箱子截图。原始异常记录 `final/console-classic.json` 保留。复现命令：

```powershell
npx esbuild scripts/check-l1-atlas-capacity.ts --bundle --platform=node --format=esm --outfile=.cache/check-l1-atlas-capacity.mjs
node .cache/check-l1-atlas-capacity.mjs
$env:L1_QA_REPORT='iteration-8/classic-retry'
$env:L1_QA_ANCHORS='parking-props,parking-round,crate'
node scripts/verify-l1-detail-runtime.mjs classic
```

后续哥特柱径、拱脚与相机的联合校准另记在第九轮，避免改变本轮旧截图对应的测量数据。
