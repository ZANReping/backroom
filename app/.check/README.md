# .check —— 离线校验工具

本目录用于在**没有安装 node_modules** 的环境里验证游戏逻辑。做法是用 `tsx` 直接跑 TypeScript 源码，
并通过 tsconfig 的 `paths` 把 `three` 与 `BufferGeometryUtils` 换成本目录下的桩实现。

| 文件 | 用途 |
|---|---|
| `smoke.mts` | 13 个层级 × 5 个种子的地图生成校验（出生点合法、出口/物品/实体落点合法、容器预填、结局层双出口） |
| `mesh-smoke.mts` | 29 个实体 + 44 个物品 + 86 种结构的低模构建校验（捕获空引用与 three API 误用） |
| `engine-smoke.mts` | 逐层模拟 400 帧游戏循环，再走通 Level 601 的假门→真门结局链 |
| `mech-smoke.mts` | v23 新机制：Level 8 熵效应倍率、Level 11 Effect、Pockets 扩容与告警、容器掉落池、Level 7 落水、Level 6 绊线 |
| `manila-smoke.mts` | 马尼拉室复刻校验：桌 / 椅 / M.E.G. 文件夹 / 米黄墙纸覆盖 / 房内无实体 |
| `testfield-smoke.mts` | 测试场地（devTestField）回归校验：生成即生效、窗口平移 stitch 后不被原始迷宫还原、落脚点合法 |
| `attack-smoke.mts` | 攻击/投掷回归校验：贴脸命中、aimEntity 准星锁定、订书机/汽油罐/电容器/氙气玻璃珠投掷效果 |
| `chalk-smoke.mts` | 粉笔头回归校验：画记号消耗、同墙不重复、无墙不误画、换层清空 |
| `light-smoke.mts` | L0 保底照明校验：非熄灯/红室 chunk 的 8×8 网格格内（有地板处）必定有灯 |
| `l1inf-smoke.mts` | L1 无限化校验：6 种区段变体覆盖、停电区无灯、维护通廊灯全 keep、出口保底+类型轮换、停电 stitch 过滤与恢复 |
| `stairs-smoke.mts` | 出口机制校验：dev 召唤出口权限、灰色阶梯稀疏保底（2×2 超区域）、L1 返程阶梯与 stitch 重注入、初始物资仅首访刷新、L1 出口配置 |
| `three-stub.ts` `bgu-stub.ts` | three.js 运行时桩（只实现项目用到的 API） |
| `three.d.ts` `react.d.ts` `shims.d.ts` | 类型桩，供 `npm run typecheck:offline` 在缺少 `@types/*` 时做类型检查 |
| `tsconfig.run.json` | 运行用（paths 指向桩） |
| `tsconfig.json` | 类型检查用（项目同款严格选项） |

## 用法

```bash
npx tsx --tsconfig .check/tsconfig.run.json .check/smoke.mts
# 或
npm run smoke:all
```

**装好真正的依赖之后**，请直接用项目自带的 `npm run build`（`tsc -b && vite build`）做权威校验；
本目录只是依赖不可用时的替代方案，其类型桩会把 three/React 的 API 误用放过去。
