# 3 组参考视觉检查

使用原图归一化关键点与未配准的几何投影比较，无自动拉伸对齐或调色。人工标注约有 1% 读取误差，点投影不能代替可见轮廓检查。灯光采样使用同图位置的线性 sRGB 均值，不是现场照度测量。

本次 scope：parking-common, parking-water, parking-bright

共 7 点，7 点在 3% 内；已标注点均在3%内；这不代表整幅还原完成。

| 场景 | ≤3% 点数/总数 | 最大横纵偏差 % | 地面亮度差（游戏−参考） | 顶部亮度差 |
|---|---:|---:|---:|---:|
| [parking-common](comparison/parking-common-compare.png) | 3/3 | 0.23 | -0.06 | 0.08 |
| [parking-water](comparison/parking-water-compare.png) | 2/2 | 0.01 | 0.02 | 0.18 |
| [parking-bright](comparison/parking-bright-compare.png) | 2/2 | 0.26 | 0.07 | 0.08 |

逐点误差与是否位于视锥内见 comparison/landmark-errors.csv；亮暗采样矩形见 reference-data.json。
