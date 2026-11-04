# Level 5 员工、交互和地图回归

在 E 盘原项目的 Three.js 游戏中验证。实际游戏用 Chrome Headless、1920×1080、RTX 4060 Laptop，种子 515151.25。验收存档只保存在浏览器内存。

| 项目 | 结果 |
| --- | --- |
| 模型与动画 | 改动前出现两次 Three.js 着色器准备异常。改动后，经典和真实光影各验证八类员工的模型、代表动作和可见性，均无 WebGL 或脚本异常。 |
| 受击 | 实际徒手击中看门人后模型没有通用受击摆动。保留专用受击动作，后台计时会归零。 |
| 寻路 | 看门人从墙一侧绕到另一侧，全程身体圆形碰撞有效。管家使用同一移动路径。 |
| 交易 | 实际点击婉拒，理智立即扣 8，关注度增加 10。怀疑触发办公室锁门和强制契约。选择理智契约并完成握手后，上限扣 20、出口恢复。自动回归覆盖保存后恢复惩罚、第二次冒犯死亡。 |
| 装饰交互 | 自动回归确认 L3 画作打开文档，L5 画作只显示文字说明，L4 画作不打开文档。装饰前台不会成为交互目标。 |
| 地图 | L5 当前楼层的大、小地图全开后显示未探索地形，关闭恢复迷雾。视口外的区块预览由后台生成，未改写探索或替换游戏地图。 |
| 物品 | 22 张 128×128 透明像素图标均成功解码，首组 7 张在实际快捷栏显示。 |

[改动前异常](before-realistic/result.json) · [经典动画](accept-classic/result.json) · [真实动画](animation-realistic/result.json) · [交易及地图](accept-realistic/result.json)

[真实光影野兽真身](animation-realistic/beast.png) · [全开地图](accept-realistic/revealed-map.png) · [快捷栏图标](accept-realistic/pixel-icons.png) · [强制契约](accept-realistic/forced-deal.png)

从 `app` 运行：

```powershell
npm run build
node scripts/verify-l5-staff-probe.mjs --classic --label=accept-classic
node scripts/verify-l5-staff-probe.mjs --label=accept-realistic --gameplay
node scripts/gen-l5-item-icons.mjs
```

另通过 `check:beast`、`check:concierge`、`check:maid`、`check:bellhop`、`check:chef`、`check:jazz`、`check:l5map`、`check:l5tails`、`check:l5items`、`check:l5-integration`、`check:outpost-return`、`check:entity-preparation`。构建仍有原有字体和包体警告。

本次测试未覆盖移动端。直接跳到餐厅时，厨师冷加载在真实光影测试中记录到最长约 5.3 秒的单次帧间隔，复杂模型首次准备仍会卡顿。
