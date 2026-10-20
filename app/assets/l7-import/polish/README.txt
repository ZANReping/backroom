Level 7 光柱与水墙优化（v66.1）
应用顺序：既有 smiler/hound/duller/l10/sky/refined-items/ui 补丁 → l7-remake.patch → l7-polish.patch
仅改动 app/src/game/renderer/l7Ocean.ts：
- 水下光柱：48 条实例化轴向公告板光束，方向为太阳经斯涅尔折射后的水中光线（全部平行、透视汇聚），高斯软截面、成簇、随海面明灭、HG 前向散射（仰望最亮），并新增朝光源方向的水下天光散射。
- 重力水墙：按视线穿墙厚度做分通道 Beer–Lambert 吸收；表面沿墙水平流动的波浪法线+菲涅尔天光反射+高光；墙面轮廓随波起伏；墙根 fbm 翻涌泡沫；进墙后画背面并模拟全内反射；上下端面不再单独绘制（修复水下仰望看到条纹底面）。
- 倒悬海面：6 组不同方向的细浪替代单向条纹。
验证：tsc 通过、check:l7 2433/0、vite build 通过、无头 Chromium 截图无报错。真机 GPU 未测。
