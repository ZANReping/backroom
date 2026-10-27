# Level 0.2 PBR 返工 · 交付说明（2026-10-25）

仓库：`/workspace/work/br-dev/repo`，分支 `level-0-2`，HEAD **983cde3**（基于 cccea0d；基线 0c8cf80）。没有 push，也没有建 PR。
没有改 app-lite 和多人部分。`app/reports/quest-l0/qa.py` 里遗留的未提交改动保持原样，没有提交。

## 提交
| 哈希 | 内容 |
|---|---|
| 35a4762 | 墙、地毯、吊顶、防撞条、OSB、龙骨、保温棉全部换成 CC0 PBR 贴图（albedo + GL 法线 + ORM）；新增 `l02Pbr.ts`，在烘焙画面上叠加法线起伏、AO 和地毯磨损；吊顶 albedo 标定到 Level 0 的颜色 |
| 5227287 | 吊顶 tint 改为 `#f4f3ef`，按同机位实测对齐 Level 0；掉落吊顶板 tint；在 SOURCES.md 登记素材；新增对比机位脚本 look_pbr.py |
| efcdb5d | qa_stage1/2 和 look_pbr 拦截 Google Fonts（返回空 CSS，不再 abort，所以没有 ERR_FAILED）；新增拼图脚本 |
| 97a0441 | QA 记录 `app/reports/level-0-2/pbr/VERIFY.md` 和拼图 |
| 983cde3 | `app/docs/素材登记.md` |

## 1. 吊顶颜色（同机位实测，种子 20261025，机位 (16,16)→(26,22)，仰角 0.45）
| | RGB | R−G | G−B |
|---|---|---|---|
| Level 0 本体（基准） | (162.0, 152.2, 109.7) | 9.8 | 42.5 |
| L0.2 返工前（灰） | (160.0, 157.2, 150.1) | 2.8 | 7.1 |
| **L0.2 返工后** | **(161.8, 151.3, 106.8)** | 10.5 | 44.5 |
| 返工后 · 仰视近景 | (163.0, 152.5, 108.1) | 10.5 | 44.4 |

实测 R>G>B，不偏绿；饱和度和 Level 0 一致；与基准各通道相差不超过 3。
改动：`l0Architecture.ts` 的 `#d8d6d1` 改为 `#f4f3ef`；吊顶贴图本身按 `l0-remake/ceiling.png` 的均值 [192,180,132] 上色；`l02Scene.ts` 里的 `#c6c4c0` 改为 `#d6d2cc`（掉落板），`#cfcfc0` 兜底色已移除。

## 2. 素材（全部 CC0 1.0）
| 表面 | 素材 | URL |
|---|---|---|
| 地毯（短绒） | ambientCG Carpet013 2K | https://ambientcg.com/view?id=Carpet013 |
| 吊顶（矿棉板） | ambientCG OfficeCeiling001 4K | https://ambientcg.com/view?id=OfficeCeiling001 |
| 墙（压纹墙纸/乳胶漆） | ambientCG Wallpaper001A 2K | https://ambientcg.com/view?id=Wallpaper001A |
| 防撞条 | ambientCG Rubber004 2K | https://ambientcg.com/view?id=Rubber004 |
| OSB | Poly Haven oriented_strand_board 2K（Dimitrios Savva） | https://polyhaven.com/a/oriented_strand_board |
| 龙骨 | ambientCG Wood049 2K | https://ambientcg.com/view?id=Wood049 |
| 保温棉 | ambientCG Fabric084 2K | https://ambientcg.com/view?id=Fabric084 |

在两处登记：`app/public/textures/l02/SOURCES.md`（权威记录，含每一步修改）和 `app/docs/素材登记.md`。源文件 SHA-256 记在 `manifest.json`。
重新生成：`SRC=… bash app/scripts/fetch-l02-pbr-sources.sh`，再 `SRC=… python3 app/scripts/gen-l02-pbr.py`（需要 numpy、scipy、Pillow）。

各表面的质感：
- **地毯**：扫描法线能看出绒头。另外按 4.8 m 周期叠了一层磨损掩码，和 1.5 m 的贴图周期不成整数比，所以看不出重复。磨损处做了三件事：人流带变浅偏灰、绒头倒伏（起伏变弱）、零星旧渍。
- **吊顶**：用真实 64 cm 矿棉板扫描，裁成 1200×600 一张板，带矿棉孔洞、企口板缝和 T 型龙骨。
- **墙**：用墙纸压纹法线，再叠程序生成的低频大波和竖向滚刷波，表现乳胶漆的微起伏。

## 3. 实现要点
L0.2 的主照明是烘焙光，放在 emissive 和顶点色里。three 的 normalMap 只对实时光起作用，aoMap 只对间接光起作用，所以只接标准通道在画面里看不出质感。
`renderer/l02Pbr.ts` 的做法是在片元里用屏幕导数求切线框，按烘焙光的大致方向算出起伏造成的明暗，再乘上 AO。
这套方法不依赖光源，Basic、Lambert、Standard 三种材质都能用；不新增 draw call，也不新增实时光。
现有着色系统没有动：tint、红室/拱门混合、闪烁、烘焙 shader 都保留。墙、地毯、防撞条的 albedo 均值和旧贴图相同，所以这几处 tint 都没改。
没有用 height/置换。height 只存进了 ORM 的 B 通道，地毯的 B 通道存的是磨损掩码。

## 4. QA（npm build → dist，`python3 -m http.server 5262`，无头 chromium，`?cpu=1`，拦截 Google Fonts）
- qa_stage2.py：**27/27**，控制台错误 0
- qa_stage1.py：**17/17**，控制台错误 0
- look_pbr.py：19 张截图，控制台错误 0
- 返工前截图来自 cccea0d 的 dist（端口 5263）。那次用 abort 拦截字体，有 2 条 `net::ERR_FAILED`，是被拦截的字体请求本身。

## 5. 性能 / 体积
- 磁盘：l02 贴图从 3.54 MB（3 套 PNG）变为 6.27 MB（7 套 JPEG，21 张），**增加 2.73 MB**。原来 OSB、龙骨、保温棉是运行时 Canvas，不占磁盘。
  原有三套的变化：地毯 1.56→1.79 MB，吊顶 0.87→1.40 MB，墙 1.10→0.67 MB。
- 显存（RGBA8 + mip 估算）：约 31 MB → 约 66 MB。每个材质的片元多 2 次采样，地毯多 3 次。

## 6. 交付文件（本目录）
- `sheets/01-吊顶色-与Level0本体并排.png`、`02-地毯近景.png`、`03-墙面近景.png`、`04-吊顶近景.png`、`05-整体走廊.png`、`06-未完工房屋.png`、`ceiling-rgb.json`
- `patch-incremental/`：5 个补丁，基于 cccea0d
- `patch-full/`：35 个补丁，基于 0c8cf80
- 两套补丁都用 `git am --keep-cr` 在干净的 worktree 上验证过，打完后的 tree 与 983cde3 完全一致（93dfa9e5）。
- `level-0-2-pbr-src-983cde3.zip`：git archive，包含 app/src、scripts、textures/l02、reports/level-0-2、docs/素材登记.md 和构建配置。
- `level-0-2-pbr-new-assets.zip`：dist 中新增的 `textures/l02`。完整 dist 有 719 MB，超过 300 MB，按约定不放。

## 7. 已知问题 / 未验证
- 未完工房屋前后两版的碎料布局不同。原因是旧 Canvas 贴图消耗了同一个伪随机序列，换成文件贴图后序列前移。不影响玩法。
- 防撞条机位画面里的防撞条偏小，材质细节看不太清。
- 没在真机 GPU 和移动端验证。
- 过程中沙箱重置过一次，chromium 是重装的；代码都已提交，没有丢。
