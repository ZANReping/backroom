# Six item atlas and model sources

Reviewed 2026-10-04. These are new procedural meshes and original generated artwork, adapted from the descriptions below. No article photographs, textures or meshes were downloaded or redistributed.

| Game ID | Source and attribution | Visual adaptation |
| --- | --- | --- |
| luckymilk | [Object 28 / 幸运豆奶](https://backrooms-wiki-cn.wikidot.com/object-28), author **SoyShamoy**, Chinese translation **sunshinelfr**; [English original](https://backrooms-wiki.wikidot.com/object-28) | Old glass milk bottle, label integrated into glass, white plain soy milk. Only the appearance is adapted; existing game effects remain. |
| capacitor | [Object 42 / Lightning In a Bottle](https://backrooms-wiki.wikidot.com/object-42), author **Sariastuff**, revisions with **SnomWriting** | Corked glass vessel containing blue branching lightning. |
| pockets | [Object 51 / 一些口袋](https://backrooms-wiki-cn.wikidot.com/object-51), author **Noctilucian**, translation **Iris011**; [English original](https://backrooms-wiki.wikidot.com/object-51) | Display name 一些口袋. Revised from the user's supplied photo to a two-leaf silver brooch with chased veins, gold beads/bezel, blue-green opal and a back pin. The article credits its reference photograph “Opal Brooch 2” to **Jessa and Mark Anderson**, CC BY 2.0. Geometry and texture are recreated procedurally; the photograph is not bundled or used as a texture. |
| fuyouyu | [Object 101 / 福友玉](https://backrooms-wiki-cn.wikidot.com/object-101), authors **Schulzenreich** and **FredrichVilmSchmitt**, translation **ShorterIsBetter9**; [English original](https://backrooms-wiki.wikidot.com/object-101) | Moss green nephrite pendant with cloudy mineral texture and red cord; pendant is one of the allowed forms. |
| skeleton | Project original; no Wikidot object correspondence claimed | Brass hotel skeleton key, open bow and bevelled teeth. |
| rabbit | Project original; no Wikidot object correspondence claimed | Lucky rabbit foot charm, directionally painted fur and metal cap. |

The four referenced Wikidot texts are under [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The resulting six-item visual asset set (procedural mesh definitions in `sixItemMesh.ts`, atlas artwork, and the three replacement pixel icons), authored for this project, is distributed under **CC BY-SA 3.0** with the above attribution and modification notice. This notice applies to these visual assets, not to unrelated project code or assets.

`scripts/gen-six-item-atlas.mjs` deterministically generates `color.png` (1024², sRGB), `normal.png` (512², OpenGL +Y, linear), `roughness.png` (512², linear) and `layout.json`. There are sixteen 256² color tiles with an eight-pixel extruded border (four pixels at 512²). Label art is original; ingredient values are paraphrased from Object 28. Fine scratches, fur flow, cork pores, opal flecks and jade clouds are generated from fixed coordinate hashes. No random external input or runtime canvas texture generation is required.

`scripts/gen-six-item-icons.mjs` produces original 32×32 pixel designs scaled without interpolation to the existing 128×128 transparent PNG specification for `luckymilk`, `pockets`, `fuyouyu`. Other item icons are unchanged.

Run from `app`: `npm run generate:six-items`. Node.js with the project's existing `@napi-rs/canvas` dependency is sufficient. Font rasterization uses the operating system's Georgia/Arial fallbacks, so exact text pixels can vary across OS/font versions; shape/noise generation is fixed. The checked-in PNGs are authoritative at runtime.
