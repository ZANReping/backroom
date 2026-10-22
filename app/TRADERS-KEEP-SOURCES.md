# 商人之家来源与许可

## 用户提供的规划与视觉参考

| 资产 | 来源与许可说明 |
|---|---|
| `app/reference/TradersKeep/plan.png` | 用户提供的游戏规划图。原图为 700×460 比例；本次确认实际规划为 420×276 米。规划图中的“5040 间”及非欧空间不属于本次实现。仅作规划参考，不宣称额外版权许可。 |
| `app/reference/TradersKeep/service-hall.png` | 视觉参考：Port Columbus，Steven Miller，CC BY 2.0；[原图](https://flic.kr/p/oAEEL6)。 |
| `app/reference/TradersKeep/market-street.png` | 视觉参考：Spice Bazaar，Bit Boy，CC BY 2.0；[原图](https://flic.kr/p/cCF9zq)。 |
| `app/reference/TradersKeep/vault-corridor.png` | B.N.T.G. 页面标注为 “empty storage unit”，Scott Meyers，CC BY 2.0；[原图](https://flic.kr/p/dmUVRe)。 |

三张截图只作视觉参考，没有裁切为游戏纹理。

## 世界观参考

| 参考 | 作者/译者 | 许可与用途 |
|---|---|---|
| [B.N.T.G.](https://backrooms-wiki-cn.wikidot.com/the-b-n-t-g) | 作者 XRaggiX、DrAkimoto、Greggita Mahayfaio；译者 Ambersight | CC BY-SA 3.0；用于背景设定参考。 |
| [交易保险库](https://backrooms-wiki-cn.wikidot.com/traders-vault) | 作者 Stretchsterz；译者 xuziqi | CC BY-SA 3.0；本次 128 间、冷藏/高安分区是用户选定的游戏改编。 |

## 运行材质

商人之家复用已有材质资产：

- `app/public/textures/settlements/tiles_color.jpg`
- `app/public/textures/settlements/tiles_normalgl.jpg`
- `app/public/textures/settlements/tiles_roughness.jpg`

以上为 ambientCG `Tiles002`，CC0，已有记录见 `app/public/textures/settlements/SOURCES.md`。

墙面和结构材质沿用 `app/public/textures/L11-ASSET-SOURCES.md` 中的准确来源记录：

- `l11_plaster`：Plaster004，Lennart Demes / ambientCG，CC0 1.0 Universal；`l11_plaster.jpg`、`l11_plaster_normal.jpg`、`l11_plaster_roughness.jpg`。
- `l11_wood`：WoodFloor051，Lennart Demes / ambientCG，CC0 1.0 Universal；`l11_wood.jpg`、`l11_wood_normal.jpg`、`l11_wood_roughness.jpg`。
- `l11_metal`：Metal032，Lennart Demes / ambientCG，CC0 1.0 Universal；`l11_metal.jpg`、`l11_metal_normal.jpg`、`l11_metal_roughness.jpg`。
- `l11_concrete`：Concrete034，Lennart Demes / ambientCG，CC0 1.0 Universal；`l11_concrete.jpg`、`l11_concrete_normal.jpg`、`l11_concrete_roughness.jpg`。

对应官方来源链接分别为 [Plaster004](https://ambientcg.com/view?id=Plaster004)、[WoodFloor051](https://ambientcg.com/view?id=WoodFloor051)、[Metal032](https://ambientcg.com/view?id=Metal032)、[Concrete034](https://ambientcg.com/view?id=Concrete034)。

本项目对已有地砖和灰泥做材质调色、磨损对比，并对粗糙度设置下限，减少过亮反射；没有新增 AI 位图。现有 NPC 与家具模型沿用本项目已有来源记录。新建筑为参数化原创低模，标签文字使用共享 Canvas 图集。
## 追加复用材质

以下记录均来自项目现有 `SOURCES.md` 文件；文件顺序为颜色、OpenGL 法线、粗糙度。

| 运行路径 | 资产 / 作者 | 许可与来源 | 颜色 / 法线 / 粗糙度 |
|---|---|---|---|
| `app/public/textures/alpha/terrazzo_{color,normalgl,roughness}.jpg` | Terrazzo001；作者记录未在现有清单中单独列出 | CC0；[metadata](https://ambientcg.com/api/v2/full_json?id=Terrazzo001&include=downloadData)，[download](https://ambientcg.com/get?file=Terrazzo001_1K-JPG.zip) | `terrazzo_color.jpg` / `terrazzo_normalgl.jpg` / `terrazzo_roughness.jpg` |
| `app/public/textures/alpha/steel_{color,normalgl,roughness}.jpg` | Metal012；作者记录未在现有清单中单独列出 | CC0；[metadata](https://ambientcg.com/api/v2/full_json?id=Metal012&include=downloadData)，[download](https://ambientcg.com/get?file=Metal012_1K-JPG.zip) | `steel_color.jpg` / `steel_normalgl.jpg` / `steel_roughness.jpg` |
| `app/public/textures/alpha/wood_{color,normalgl,roughness}.jpg` | Wood051；作者记录未在现有清单中单独列出 | CC0；[metadata](https://ambientcg.com/api/v2/full_json?id=Wood051&include=downloadData)，[download](https://ambientcg.com/get?file=Wood051_1K-JPG.zip) | `wood_color.jpg` / `wood_normalgl.jpg` / `wood_roughness.jpg` |
| `app/public/textures/alpha/cardboard_{color,normalgl,roughness}.jpg` | Cardboard004；作者记录未在现有清单中单独列出 | CC0；[metadata](https://ambientcg.com/api/v2/full_json?id=Cardboard004&include=downloadData)，[download](https://ambientcg.com/get?file=Cardboard004_1K-JPG.zip) | `cardboard_color.jpg` / `cardboard_normalgl.jpg` / `cardboard_roughness.jpg` |
| `app/public/textures/settlements/ceiling_{color,normalgl,roughness}.jpg` | OfficeCeiling002；作者记录未在现有清单中单独列出 | CC0；[download](https://ambientcg.com/get?file=OfficeCeiling002_1K-JPG.zip) | `ceiling_color.jpg` / `ceiling_normalgl.jpg` / `ceiling_roughness.jpg` |
| `app/public/textures/l11_limestone{,_normal,_roughness}.jpg` | Tiles139；Lennart Demes / ambientCG | CC0 1.0 Universal；[Tiles139](https://ambientcg.com/view?id=Tiles139) | `l11_limestone.jpg` / `l11_limestone_normal.jpg` / `l11_limestone_roughness.jpg` |
| `app/public/textures/settlements/fabric_{color,normalgl,roughness}.jpg` | Fabric061；作者记录未在现有清单中单独列出 | CC0；[download](https://ambientcg.com/get?file=Fabric061_1K-JPG.zip) | `fabric_color.jpg` / `fabric_normalgl.jpg` / `fabric_roughness.jpg` |

现有来源清单没有为 Terrazzo001、Metal012、Wood051、Cardboard004、OfficeCeiling002、Fabric061 单独记录作者字段，因此这里保留为“未在现有清单中单独列出”，没有补猜作者信息。

## 当前吊顶与玻璃实现

最终吊顶使用上述 Plaster004 灰泥扫描作为底纹，配合代码生成的板缝与真实骨架/风口；OfficeCeiling002 保留为早期迭代来源记录，最终没有采样其中的固定灯斑。水磨石与石材保留原图及法线/粗糙度，仅作材质对比和色调校准。64 面玻璃为低成本透明 PBR，不使用实时折射；板缝、编号与导视为项目代码生成，不使用参考照片裁贴。

## 公共/办公/生活区细化资产（2026-10-21）

- 新模型为项目内参数化建模：`renderer/tradersDressingMeshes.ts`、`tradersLivingProps.ts`、`tradersWallFixtures.ts`，由 `tradersDressingParts.ts` 生成明确厚度的网格和 UV。没有从不明来源模型包中取用素材。
- 印刷图集为 `scripts/generate-traders-dressing.py` 的原始代码绘制，固定种子 `20261021`。输出 `public/textures/traders/dressing_color.jpg`（1024²）、`dressing_normalgl.jpg` 与 `dressing_roughness.jpg`（各 512²）。图格外扩、OpenGL 法线、重建命令、字体使用及 SHA-256 见 [图集来源记录](public/textures/traders/DRESSING-SOURCES.md)。脚本没有采样外部位图，没有 AI 生成步骤；印刷平面使用平法线，织物/纸箱/木材的细纹使用已有扫描法线。
- 新增模型沿用本页已记录的 Cardboard004、Metal012、Wood051、Fabric061 等 CC0 材料。纯色搪瓷、塑胶、橡胶、低成本水面与镜面参数由代码提供；未增加新外部贴图或实时反射捕获。
- 图集中导览、通知、条码、值班表和表单均为游戏内装饰，未使用真实人物或商户标识；当前仍不设置具体商铺内容。没有把参考照片当作墙面或背景贴入场景。

## 银行 ATM（2026-10-22）

- `src/game/renderer/tradersAtm.ts` 为本项目参数化原创 ATM 模型，复用本页已记录的授权材质与共享文字图集；没有新增第三方模型或贴图。
- `BntgAtm.tsx` 与配套 CSS 为代码绘制的原创交互界面，模拟存取款、余额和最近交易明细；不接入真实银行卡、账户或支付服务。
