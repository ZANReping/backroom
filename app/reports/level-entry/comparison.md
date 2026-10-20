# Level entry comparison: baseline → final

GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)
Viewport: 1920 × 1080
Seed: 424242
Mode: realistic
Settings: {"texture":1,"lights":16,"shadows":true,"lightShadows":1,"loadingBudget":6,"chunkBudget":3,"detail":1,"bloom":true,"ao":1}

Measurement: loadMs runs from map preparation start until two frames after Renderer3D.isNearWorldReady. A single run cannot guarantee performance across devices.
Performance note: baseline enabled CPU Profiler, and background device load was not strictly controlled across runs; before/after differences are for bottleneck investigation and are not a strictly controlled performance percentage.

Reproduce final: `node scripts/verify-level-entry.mjs --label=final`

| ID | Before total | After total | Improvement | Final map preparation | Final generation | Render preparation | ≤10,000 ms and ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 0 Level 0 | 14.536 s | 4.710 s | 9.826 s | 0.721 s | 0.051 s | 3.912 s | 是 |
| 1 Level 1 | 21.649 s | 9.477 s | 12.173 s | 1.208 s | 0.006 s | 8.243 s | 是 |
| 2 Level 2 | 10.634 s | 4.706 s | 5.928 s | 0.516 s | 0.009 s | 4.153 s | 是 |
| 3 Level 3 | 20.508 s | 4.368 s | 16.140 s | 0.503 s | 0.006 s | 3.846 s | 是 |
| 4 Level 4 | 19.751 s | 4.017 s | 15.734 s | 0.573 s | 0.007 s | 3.402 s | 是 |
| 5 Level 5 | 34.971 s | 8.769 s | 26.202 s | 0.520 s | 0.008 s | 8.197 s | 是 |
| 6 Level 6 | 8.649 s | 2.458 s | 6.191 s | 0.448 s | 0.004 s | 1.986 s | 是 |
| 7 Level 7 | 26.415 s | 5.359 s | 21.056 s | 0.727 s | 0.006 s | 4.606 s | 是 |
| 8 Level 8 | 8.318 s | 3.550 s | 4.768 s | 0.853 s | 0.007 s | 2.677 s | 是 |
| 9 Level 9 | 20.125 s | 4.611 s | 15.514 s | 0.435 s | 0.007 s | 4.139 s | 是 |
| 10 Level 10 | 20.114 s | 4.582 s | 15.531 s | 0.552 s | 0.006 s | 4.011 s | 是 |
| 11 Level 11 | 12.282 s | 7.751 s | 4.531 s | 0.587 s | 0.010 s | 7.102 s | 是 |
| 12 Level 601 | 8.095 s | 2.596 s | 5.498 s | 0.000 s | 0.028 s | 2.554 s | 是 |
| 101 Alpha 基地 | 27.083 s | 6.841 s | 20.242 s | 0.000 s | 0.068 s | 6.702 s | 是 |
| 102 商人之家 | 5.239 s | 2.923 s | 2.317 s | 0.000 s | 0.030 s | 2.879 s | 是 |
| 103 希波克拉底 - 1 | 4.565 s | 2.845 s | 1.720 s | 0.000 s | 0.006 s | 2.827 s | 是 |
| 104 Tom 的餐馆 | 2.583 s | 1.813 s | 0.770 s | 0.000 s | 0.006 s | 1.774 s | 是 |
| 105 办公区EL3A | 3.772 s | 2.621 s | 1.150 s | 0.000 s | 0.017 s | 2.592 s | 是 |
| 106 M.E.G. Gemma 基地 | 2.472 s | 1.770 s | 0.702 s | 0.000 s | 0.017 s | 1.737 s | 是 |
| 107 存储设施 | 1.939 s | 1.359 s | 0.580 s | 0.000 s | 0.010 s | 1.338 s | 是 |
| 108 蓝色救赎 | 1.653 s | 1.145 s | 0.508 s | 0.000 s | 0.009 s | 1.128 s | 是 |
| 109 M.E.G. Omega 基地 | 2.161 s | 1.570 s | 0.591 s | 0.000 s | 0.011 s | 1.544 s | 是 |
| 110 M.E.G. 哨所「家政服务」 | 1.639 s | 1.023 s | 0.616 s | 0.000 s | 0.006 s | 1.008 s | 是 |
| 111 家常酒店 | 2.186 s | 1.110 s | 1.075 s | 0.000 s | 0.005 s | 1.095 s | 是 |
| 112 原住民 | 1.763 s | 1.095 s | 0.668 s | 0.000 s | 0.005 s | 1.079 s | 是 |
| 113 M.E.G.“空巢”前哨站 | 2.759 s | 1.784 s | 0.974 s | 0.000 s | 0.005 s | 1.770 s | 是 |
| 114 哈莫兹洞穴社群 | 1.770 s | 1.236 s | 0.534 s | 0.000 s | 0.004 s | 1.220 s | 是 |
| 116 丰饶角 | 2.393 s | 1.222 s | 1.171 s | 0.000 s | 0.004 s | 1.194 s | 是 |
| 274 Level 274 · 杰瑞的房间 | 1.689 s | 1.225 s | 0.464 s | 0.000 s | 0.009 s | 1.202 s | 是 |

Production source: production-final. 冷加载 loadMs 不包含过场；生产流程包含过场。
真实过场 ≤10秒且 movementPassed 的项：29/29。
超过10秒列表：无。

| ID | Production playable | ≤10秒 | movementPassed |
| --- | ---: | :---: | :---: |
| 0 | 3.317 s | 是 | 是 |
| 1 | 8.144 s | 是 | 是 |
| 2 | 4.420 s | 是 | 是 |
| 3 | 6.099 s | 是 | 是 |
| 4 | 4.068 s | 是 | 是 |
| 5 | 7.852 s | 是 | 是 |
| 6 | 3.233 s | 是 | 是 |
| 7 | 6.239 s | 是 | 是 |
| 8 | 5.314 s | 是 | 是 |
| 9 | 5.410 s | 是 | 是 |
| 10 | 4.062 s | 是 | 是 |
| 11 | 8.572 s | 是 | 是 |
| 12 | 3.983 s | 是 | 是 |
| 101 | 6.223 s | 是 | 是 |
| 102 | 3.354 s | 是 | 是 |
| 103 | 3.511 s | 是 | 是 |
| 104 | 2.872 s | 是 | 是 |
| 105 | 3.112 s | 是 | 是 |
| 106 | 2.701 s | 是 | 是 |
| 107 | 2.677 s | 是 | 是 |
| 108 | 2.618 s | 是 | 是 |
| 109 | 2.672 s | 是 | 是 |
| 110 | 2.673 s | 是 | 是 |
| 111 | 2.861 s | 是 | 是 |
| 112 | 2.672 s | 是 | 是 |
| 113 | 2.869 s | 是 | 是 |
| 114 | 2.676 s | 是 | 是 |
| 116 | 2.864 s | 是 | 是 |
| 274 | 2.639 s | 是 | 是 |

Classic source: classic. ready 且 ≤10秒的项：29/29。
Classic errors: 0; network errors: 1; cleanup: {"browserExit":"SIGTERM","serverExit":"SIGTERM","profileRemoved":true}。

| ID | Classic load | status | ready 且 ≤10秒 |
| --- | ---: | :---: | :---: |
| 0 | 2.872 s | ready | 是 |
| 1 | 4.034 s | ready | 是 |
| 2 | 1.991 s | ready | 是 |
| 3 | 1.941 s | ready | 是 |
| 4 | 2.389 s | ready | 是 |
| 5 | 5.817 s | ready | 是 |
| 6 | 1.297 s | ready | 是 |
| 7 | 2.438 s | ready | 是 |
| 8 | 1.911 s | ready | 是 |
| 9 | 2.781 s | ready | 是 |
| 10 | 2.052 s | ready | 是 |
| 11 | 3.611 s | ready | 是 |
| 12 | 1.091 s | ready | 是 |
| 101 | 2.752 s | ready | 是 |
| 102 | 0.795 s | ready | 是 |
| 103 | 0.626 s | ready | 是 |
| 104 | 0.475 s | ready | 是 |
| 105 | 0.775 s | ready | 是 |
| 106 | 0.755 s | ready | 是 |
| 107 | 0.558 s | ready | 是 |
| 108 | 0.377 s | ready | 是 |
| 109 | 0.726 s | ready | 是 |
| 110 | 0.406 s | ready | 是 |
| 111 | 0.386 s | ready | 是 |
| 112 | 0.396 s | ready | 是 |
| 113 | 0.419 s | ready | 是 |
| 114 | 0.373 s | ready | 是 |
| 116 | 0.380 s | ready | 是 |
| 274 | 0.504 s | ready | 是 |

Result: ok
