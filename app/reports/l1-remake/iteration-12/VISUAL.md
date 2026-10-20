# 3 组参考视觉检查

使用原图归一化关键点与未配准的几何投影比较，无自动拉伸对齐或调色。人工标注约有 1% 读取误差，点投影不能代替可见轮廓检查。灯光采样使用同图位置的线性 sRGB 均值，不是现场照度测量。

本次 scope：parking-common, parking-round, parking-dim

共 10 点，10 点在 3% 内；已标注点均在3%内；这不代表整幅还原完成。

| 场景 | ≤3% 点数/总数 | 最大横纵偏差 % | 地面亮度差（游戏−参考） | 顶部亮度差 |
|---|---:|---:|---:|---:|
| [parking-common](comparison/parking-common-compare.png) | 3/3 | 1.79 | -0.04 | 0.15 |
| [parking-round](comparison/parking-round-compare.png) | 4/4 | 2.07 | -0.03 | 0.04 |
| [parking-dim](comparison/parking-dim-compare.png) | 3/3 | 1.69 | -0.01 | -0.00 |

逐点误差与是否位于视锥内见 comparison/landmark-errors.csv；亮暗采样矩形见 reference-data.json。
