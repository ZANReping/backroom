# 人士图鉴与形象编辑验收

最终运行：2026-10-17，结果为 [verified/result.json](verified/result.json)，`ok: true`。源码与复现命令见 [功能说明](../../PEOPLE-AVATAR-UI.md)。

## 性能记录

1920×1080、DPR 1，桌面 Chrome 真正无头模式；生产 UI 与真实人物工厂，隔离存储解锁 96 名人士。计时从点击“人士”到随后两次 `requestAnimationFrame`，表示列表开始显示的时间，不代表所有肖像生成完毕。肖像生成统计在随后 3.5 秒采样。

| 检查 | 列表显示时间 | 新生成肖像 | 待处理任务 |
| --- | ---: | ---: | ---: |
| 新肖像缓存，首次打开 | 98.1 ms | 5 | 0 |
| 再次打开 | 54.7 ms | 0 | 0 |
| 连续重开第 1／2／3 次 | 34.1／67.2／63.7 ms | 0／0／0 | 0／0／0 |

滚动到底部后累计生成 11 张，而非一次生成 96 张。继续查看 Tiny 后缓存共 18 张、约 550 KiB；三次重开期间缓存、几何及纹理数量不再增加。取消未开始的请求不会继续建模或调用回调。首次肖像渲染仍记录到一次 174 ms 长任务，后续重开无长任务；这保留了首次 GPU 程序编译／上传的实际限制。

旧同步实现的完整冷启动测量在 180 秒 CDP 等待内未返回，证据保留在 [baseline/result.json](baseline/result.json)。因此不计算优化百分比，也不将超时等同于确定的页面加载时长。上述数值是此机器的一次固定视口 UI 采样，不是所有游戏场景的 FPS 结论。

## 交互与视觉

- 264 项取景断言通过：11 个代表 NPC、两种旋转、世界坐标偏移，覆盖面部与全身边界。
- 9 项编辑器检查通过：标签聚焦、静止朝向、键盘切换、即时保存、切换／编辑复用 WebGL 画布。
- 既有形象 UI 的 24 项回归通过，包括胡须选项和连续保存。
- 鼠标与触控实际拖动改变相机矩阵；停止拖动后无自动旋转。
- 390×844 竖屏与 844×390 横屏通过截图核对，竖屏无水平溢出。触控为桌面模拟，不代表 Android 真机性能。
- 实际应用 `/` 的主菜单背景就绪后，点击“形象编辑”显示头部预览及两个标签。
- 浏览器无运行时／着色器错误；仅有与本功能无关的 `favicon.ico` 404。
- 生产构建成功，保留项目已有的大体积 bundle 提示；定向 ESLint 通过。

| 视图 | 截图 |
| --- | --- |
| 人士首次打开／滚动 | [首次](verified/people-cold.png)、[滚动后](verified/people-scrolled.png)、[Tiny](verified/people-tiny.png) |
| 头肩证件照 | [Lan](verified/portrait-lan.png)、[Tom](verified/portrait-tom.png)、[Aiko](verified/portrait-aiko.png)、[Kowalski](verified/portrait-kowalski.png) |
| 编辑器头部／身体／拖动 | [头部](verified/editor-head.png)、[身体](verified/editor-body.png)、[旋转后](verified/editor-dragged.png) |
| 触控布局 | [竖屏](verified/editor-mobile.png)、[横屏](verified/editor-landscape.png) |
| 实际主菜单入口 | [主菜单中的编辑器](verified/main-editor.png) |

浏览器启动参数、独立端口、进程编号及清理结果保存在结果 JSON。脚本完成后关闭自身浏览器和服务器并删除自身临时配置目录；未连接或关闭日常浏览器。

`release` 和 `acceptance` 为自动化脚本调试记录：主菜单实际已打开，但早期定位／返回 DOM 节点的脚本等待超时；最终 `verified` 修正了检查并全部通过。`after`、`final` 为开发过程快照，验收以 `verified` 为准。
