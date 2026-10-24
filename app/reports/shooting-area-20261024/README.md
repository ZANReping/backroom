# N14 试射位扩展（2026-10-24）

原项目：`E:\ZAN\backroom`；仅调整 `app` 与根项目说明，保留当前工作区其他更新。

## 改动

- 允许持枪站位从 **5.45×5.25m** 扩大为 **7.30×7.05m**，面积从28.61m²增至51.47m²，约增加80%。增加右侧活动范围及1.8m后退空间。
- 后矮墙移至店内z=11.2m，宽6.8m，右端留出店铺入口通路；标牌同步后移。管理员移至店内(-0.6,4.4)，站在射击区域外、朝西观察。
- 修复侧移时误收枪：原逻辑要求首次命中点在靶道地面矩形内，但侧墙内表面略超出该矩形；子弹已经经过纸靶、命中真正侧墙时也会提示「枪口只能朝着靶道」。扩大命中区域至真实侧/端墙内表面，保持营业厅一侧不在靶道命中范围内。
- 朝向、NPC保护、进入靶道前方及区域外禁枪仍由原引擎逻辑检查。靶位、弹道、物品和存档字段不变；没有增加灯光或模型件数。

生产实现集中在 `src/game/content/tradersShops.ts` 的 `GUN_LANE_LOCAL`、矮墙/标牌和管理员岗位。说明同步至 `FIREARMS.md` 及根 `info.md`。

## 检查

| 项目 | 结果 |
|---|---|
| 店铺通路、物件及岗位检查 | `check:traders-shops`，1508项通过 |
| 枪械机制回归 | `check:firearms`，137项通过 |
| 当前生产构建 | `npm run build` 通过；保留现有字体、PostCSS及大包体积提示 |
| 真实光影实际游戏 | 23项通过，控制台/网络失败0 |
| 经典光影实际游戏 | 23项通过，控制台/网络失败0 |

实机使用1920×1080、种子424242、Level102，原生渲染比例，动态分辨率/动态曝光关闭，纹理质量1、场景灯上限16、阴影质量1。测试有独立存档和真正的 `--headless=new` Chrome、随机Vite/CDP端口；只回收本轮自己的浏览器/服务器，临时配置均已删除。

开发者神模式及属性锁仅用于复现。通过真实S键后退、D键侧移，持续记录位置及收枪状态；不是直接篡改收枪状态。四个新增位置用真实装填和攻击键击发，并验证越界、靶道前方、准星朝NPC时不能开枪。攻击键仅在隔离测试配置中绑定K，不改变用户日常键位。旧存档岗位恢复沿用既有固定岗位规则，无需新增存档版本。

## 实机截图

| 内容 | 真实模式 | 经典模式 |
|---|---|---|
| 新增后退空间 | [截图](realistic-final/02-backpedal-expanded-depth.png) | [截图](classic-final/02-backpedal-expanded-depth.png) |
| 侧移后仍持枪 | [截图](realistic-final/03-sidestep-expanded-width.png) | [截图](classic-final/03-sidestep-expanded-width.png) |
| 右后侧开枪后 | [截图](realistic-final/04-rear-right.png) | [截图](classic-final/04-rear-right.png) |
| 区域外收枪 | [截图](realistic-final/05-outside-stowed.png) | [截图](classic-final/05-outside-stowed.png) |
| 管理员与安全检查 | [截图](realistic-final/06-npc-safety.png) | [截图](classic-final/06-npc-safety.png) |
| 新区域总览 | [截图](realistic-final/07-expanded-range-overview.png) | [截图](classic-final/07-expanded-range-overview.png) |

已查看真实模式的侧移和总览截图，核对新站位、管理员和店内通路。完整结果包含每帧行走轨迹、枪械状态、截图清单、启动参数、GPU及清理结果，见两个 `*-final/runtime.json`。初次侧移暴露的旧命中矩形问题保留在 `realistic/runtime.json`，以两份final为最终结果；诊断修正结果另存 `trace-fixed.log`。

## 复现

```powershell
cd E:\ZAN\backroom\app
npm run check:traders-shops
npm run check:firearms
npm run build
node reports/shooting-area-20261024/verify.mjs --label=realistic-final
node reports/shooting-area-20261024/verify.mjs --classic --label=classic-final
```

本轮未做新的帧时间性能对照或Android真机测试；这是范围/摆放和误收枪修复，不声明全据点性能变化。
