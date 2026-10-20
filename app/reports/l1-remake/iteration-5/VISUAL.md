# 十八参考视觉验收

使用原图归一化关键点与未配准的几何投影比较，无自动拉伸对齐或调色。人工标注约有 1% 读取误差，点投影不能代替可见轮廓检查。灯光采样使用同图位置的线性 sRGB 均值，不是现场照度测量。

共 38 点，5 点在 3% 内；整体未达到 3% 目标。

| 场景 | ≤3% 点数/总数 | 最大横纵偏差 % | 地面亮度差（游戏−参考） | 顶部亮度差 |
|---|---:|---:|---:|---:|
| [parking-common](comparison/parking-common-compare.png) | 3/3 | 1.58 | -0.03 | 0.12 |
| [parking-round](comparison/parking-round-compare.png) | 0/2 | 10.59 | 0.05 | 0.28 |
| [parking-room](comparison/parking-room-compare.png) | 0/2 | 139.25 | 0.11 | 0.32 |
| [parking-water](comparison/parking-water-compare.png) | 0/2 | 16.46 | 0.18 | 0.28 |
| [parking-bright](comparison/parking-bright-compare.png) | 0/2 | 28.82 | 0.14 | 0.21 |
| [parking-clean](comparison/parking-clean-compare.png) | 0/2 | 23.80 | 0.18 | 0.28 |
| [parking-dry](comparison/parking-dry-compare.png) | 0/2 | 63.08 | 0.04 | 0.21 |
| [parking-dim](comparison/parking-dim-compare.png) | 0/2 | 26.44 | -0.02 | -0.01 |
| [parking-dark](comparison/parking-dark-compare.png) | 1/2 | 40.69 | -0.01 | -0.00 |
| [parking-props](comparison/parking-props-compare.png) | 0/2 | 6.74 | 0.06 | 0.27 |
| [storage](comparison/storage-compare.png) | 0/2 | 10.75 | -0.24 | -0.05 |
| [gothic](comparison/gothic-compare.png) | 1/3 | 13.11 | -0.04 | 0.02 |
| [ouroboros](comparison/ouroboros-compare.png) | 0/2 | 23.41 | -0.12 | -0.07 |
| [garden](comparison/garden-compare.png) | 0/2 | 22.25 | -0.06 | 0.01 |
| [path-corridor](comparison/path-corridor-compare.png) | 0/2 | 9.89 | 0.01 | 0.24 |
| [path-room](comparison/path-room-compare.png) | 0/2 | 17.40 | -0.02 | 0.08 |
| [crate](comparison/crate-compare.png) | 0/2 | 38.41 | 0.12 | 0.11 |
| [power-out](comparison/power-out-compare.png) | 0/2 | 59.63 | -0.01 | -0.01 |

逐点误差与是否位于视锥内见 comparison/landmark-errors.csv；亮暗采样矩形见 reference-data.json。
