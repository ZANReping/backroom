# Level 3 texture sources

本次 Level 3 重制使用两组来源。Poly Haven 新下载的 1K JPG Color、NormalGL、Roughness 详见子目录 [`polyhaven/SOURCES.md`](polyhaven/SOURCES.md)：

- [painted_brick](https://polyhaven.com/a/painted_brick)
- [factory_brick](https://polyhaven.com/a/factory_brick)
- [concrete_floor_worn_001](https://polyhaven.com/a/concrete_floor_worn_001)
- [terrazzo_tiles](https://polyhaven.com/a/terrazzo_tiles)

上述 Poly Haven 素材遵循 [Poly Haven CC0 License](https://polyhaven.com/license)。`painted_brick` 在 shader 中执行去蓝转白处理，以适配装配线区域的旧白漆砖墙。

现用 ambientCG 免费材质复用自 `l2` 目录：

- [Bricks006](https://ambientcg.com/view?id=Bricks006)
- [Concrete012](https://ambientcg.com/view?id=Concrete012)
- [Concrete023](https://ambientcg.com/view?id=Concrete023)
- [Plaster001](https://ambientcg.com/view?id=Plaster001)
- [Metal012](https://ambientcg.com/view?id=Metal012)
- [Rust004](https://ambientcg.com/view?id=Rust004)

上述 ambientCG 素材遵循 [ambientCG License](https://docs.ambientcg.com/license/)，可在 CC0 条款下使用。

圣所彩窗已完全替换为真实几何玻璃片、铅条和石框，人物轮廓也使用几何，无贴图。仓库内的 `stainedglass-reference.png` 只保留为用户提供的图十三原图参考，运行时不使用；它不是 CC0 素材。

