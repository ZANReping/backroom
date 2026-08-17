## 最近更新（Level 7 / 水体 / 交互）

### 快速游泳：严格按准星 3D 方向
- 冲刺游泳时 WASD 只负责触发冲刺，不再决定方向。
- 水平位移 = 视线 yaw 的水平投影，并按 cos(pitch) 缩放。
- 垂直速度 = speed × sin(pitch)：抬头严格上浮、低头严格下潜、平视保持深度。
- 优先级：快速游泳准星方向 > 蹲伏下潜 > 跳跃上浮 > 中性悬浮。
- 冲刺游泳时按住跳跃/蹲伏不会覆盖准星方向；非冲刺时原行为不变。

### 水面表现与真实水体
- 已删除水面分界膜，只保留一层水体面。
- 默认与真实水体都不再使用 l7_water_surface.png；真实水体为纯色海面 + 细小顶点波浪（幅度约 0.04m）。
- 设置「画面」新增“真实水体效果”，默认关闭；开启后波浪随全局时间连续起伏。
- 玩家在 L7 水面附近会随波浪自然上下浮动（z 约 -0.1~0.1m），相机眼高贴近水线并带横摇/俯仰，不再像站在固体平面上。

### 旧书文档
- 《来源不明的书》打开的“七层之物”文档页面可独立滚动。
- 滚动条完全隐藏（scrollbar-width: none + WebKit 隐藏），保留滚轮/触摸滚动。

### 相关校验
- .check/l7browser-smoke.py：纯色水体、无分界膜、真实水体波浪着色器、旧书滚动、手电阴影尺寸。
- .check/l7cabin-smoke.mts：快速游泳抬头/低头严格按准星，且不被跳跃覆盖。
- .check/l7fixes-smoke.mts：水面漂浮起伏、水下结构碰撞、交互 z 轴门槛。

Using Node.js 20, Tailwind CSS v3.4.19, and Vite v7.2.4

Tailwind CSS has been set up with the shadcn theme

Setup complete: /mnt/agents/output/app

Components (40+):
  accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb,
  button-group, button, calendar, card, carousel, chart, checkbox, collapsible,
  command, context-menu, dialog, drawer, dropdown-menu, empty, field, form,
  hover-card, input-group, input-otp, input, item, kbd, label, menubar,
  navigation-menu, pagination, popover, progress, radio-group, resizable,
  scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
  spinner, switch, table, tabs, textarea, toggle-group, toggle, tooltip

Usage:
  import { Button } from '@/components/ui/button'
  import { Card, CardHeader, CardTitle } from '@/components/ui/card'

Structure:
  src/sections/        Page sections
  src/hooks/           Custom hooks
  src/types/           Type definitions
  src/App.css          Styles specific to the Webapp
  src/App.tsx          Root React component
  src/index.css        Global styles
  src/main.tsx         Entry point for rendering the Webapp
  index.html           Entry point for the Webapp
  tailwind.config.js   Configures Tailwind's theme, plugins, etc.
  vite.config.ts       Main build and dev server settings for Vite
  postcss.config.js    Config file for CSS post-processing tools