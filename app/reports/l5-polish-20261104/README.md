# Level 5 修复验收

种子 515151.25。Chrome 无头模式使用 RTX 4060 Laptop GPU，1920×1080，动态分辨率关闭。触控快捷入口使用 844×390 的桌面触控模拟。

## 黑屏

用相同走廊视角复现了野兽入镜后画布全黑。迎宾女郎放兔的场景也复现了。对照中 WebGL 上下文存活，场景颜色缓冲中心仍有正常颜色。泛光模糊输出出现了 half-float 非数值，临时关闭泛光时画面恢复。修复后保持泛光开启重测真实光影，并复测经典光影。

| 场景 | 真实光影黑帧／样本 | 经典光影黑帧／样本 |
| --- | ---: | ---: |
| 走廊野兽 | 0／40 | 0／32 |
| 爵士脑四人演出 | 0／197 | 0／181 |
| 迎宾女郎释放发条兔 | 0／69 | 0／54 |

画布缩放采样间隔至少 95 ms。脚本检测到发条兔实体实际生成、四个爵士脑分别进入演奏片段。该脚本同时进行 GPU 读回，帧间隔用于诊断。冷启动期间仍观测到最长约 1.6 秒的停顿。

## 其他验收

- L5 地图四个朝向及 16 个注册据点的团体排序通过。点击和模拟触摸状态栏下方入口均能打开登记簿。
- 实际员工名录的七张照片都保持宽高比。图鉴回归报告位于相邻的 l5-staff-codex-20261104/roster-polish 目录。
- 22 张 PNG 均能解码，并在快捷栏显示。源文件为 64×64 Aseprite 作品，PNG 为 2 倍最近邻导出。
- Web Audio 测试切换了爵士与留声机焦点，留声机重复请求只发起一次解码，迟到的缓冲不会跨层播放。前台电话离线渲染峰值约 0.019。
- 生产构建、L5 地图、物品和集成、实体准备、爵士脑、野兽、迎宾女郎、发条兔及看门人相关回归通过。

## 复现

运行目录为 app。

~~~powershell
node scripts/gen-l5-item-icons.mjs
node scripts/verify-l5-staff-probe.mjs --polish --label=realistic-final
node scripts/verify-l5-staff-probe.mjs --polish --classic --label=classic-final
node scripts/verify-l5-staff-codex.mjs --label=roster-polish
npm run build
~~~

图标生成器可通过 ASEPRITE_PATH 指定 Aseprite。result.json 和截图位于各测试标签目录。diagnostic-hdr 保存了修复前的缓冲对照。

