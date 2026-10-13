# Level 1 Poly Haven plant leaf sources

These four files are original 1K JPG downloads from [Potted Plant 02](https://polyhaven.com/a/potted_plant_02), by Rico Cilliers, licensed CC0 1.0 ([license](https://creativecommons.org/publicdomain/zero/1.0/)). They were not edited.

| Local path | Original URL |
| --- | --- |
| `leaves_diff.jpg` | `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_diff_1k.jpg` |
| `leaves_alpha.jpg` | `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_alpha_1k.jpg` |
| `leaves_nor_gl.jpg` | `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_nor_gl_1k.jpg` |
| `leaves_rough.jpg` | `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_rough_1k.jpg` |

The engine samples three leaf UV regions (selected in `src/game/world/l1Bake.ts`) and shares the alpha, OpenGL normal, and roughness maps. The 1K assets use the existing mipmap and quality settings. Reproduction is provided by `app/scripts/fetch-l1-open-assets.mjs`, which contains the fixed URLs and MD5 values, downloads to temporary files, verifies them, skips already verified files, and refuses mismatched existing outputs.

The existing Level 3 `painted_brick` three-channel reuse is documented in `app/public/textures/l3/polyhaven/SOURCES.md`; its exact Poly Haven author is Amal Kumar. Its white appearance is produced in the material shader by reducing blue and increasing brightness; the image files are unchanged.
