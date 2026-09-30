# Level 2 reference materials — 2026-09-12

These are newly downloaded 1K JPG material sets from ambientCG, not aliases of existing project textures. Only Color, NormalGL and Roughness maps are shipped in this directory.

| Source | Use |
| --- | --- |
| [Plaster001](https://ambientcg.com/view?id=Plaster001) | Pale painted walls, pipe insulation and painted door panels |
| [Concrete030](https://ambientcg.com/view?id=Concrete030) | Dark corridor walls; neutral concrete floor |
| [Concrete012](https://ambientcg.com/view?id=Concrete012) | Weathered plaster walls and exposed ceiling slabs |
| [Concrete023](https://ambientcg.com/view?id=Concrete023) | Dirty corridor floor |
| [Bricks006](https://ambientcg.com/view?id=Bricks006) | Exposed masonry piers and beams |
| [Metal012](https://ambientcg.com/view?id=Metal012) | Galvanized brackets, cable trays and fixture housings |
| [Rust004](https://ambientcg.com/view?id=Rust004) | Corroded pipe shells and fragments |

Download: `https://ambientcg.com/get?file=ASSET_1K-JPG.zip`.
License: [Creative Commons CC0 1.0 Universal](https://docs.ambientcg.com/license/), including redistribution in games. Color maps are sRGB; NormalGL and Roughness are linear data.

The original maps remain unchanged. `renderer/l2Materials.ts` grades their colors and normal strength in the material/shader: pale mineral plaster, dusty gray concrete, desaturated masonry, ochre iron oxide. The Rust004 texture also supplies the natural stain pattern for dirty plaster. Rust010 was evaluated and rejected because its oxide was too uniform.

Doors inherit the surrounding corridor's wall maps and shader through `renderer/l2Door.ts`, with a small deterministic red, blue, green or yellow tint. This uses the same downloaded CC0 maps; no additional texture files are required.

The eight user photographs and [Level 2 wiki](https://backrooms-wiki-cn.wikidot.com/level-2) are visual/design references, not redistributed texture assets. Corridor categories follow the user's five reference images; the current wiki supplies industrial equipment, lighting, exposed wiring and door details.
