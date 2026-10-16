# Level 9 / Level 10 tree asset sources

The Level 9 and Level 10 outdoor trees reuse the same openly licensed foliage and
bark source channels as Level 11. No new downloaded model, leaf atlas, or generated
image is introduced for these levels. The runtime reads the shared files below;
the six silhouettes and four branch arrangements are project-owned procedural
geometry.

## Shared CC0 source assets

| Material | Official source | Author | License | Local source metadata | Runtime files |
|---|---|---|---|---|---|
| Leaf atlas | [Poly Haven tree_small_02](https://polyhaven.com/a/tree_small_02) | Rico Cilliers | [CC0 1.0 Universal](https://polyhaven.com/license) | `app/assets/l11-foliage/info.json`, `app/assets/l11-foliage/files.json`, `app/assets/l11-foliage/manifest.json` | `app/public/textures/l11-foliage/{1k,2k}/leaves.png`, `normal.jpg`, `roughness.jpg` |
| Branch/bark maps | [Poly Haven tree_small_02](https://polyhaven.com/a/tree_small_02) | Rico Cilliers | [CC0 1.0 Universal](https://polyhaven.com/license) | `app/assets/l11-bark/manifest.json`, `app/assets/l11-bark/files.json` | `app/public/textures/l11-bark/{1k,2k}/color.jpg`, `normal.jpg`, `roughness.jpg` |

The leaf diffuse and alpha channels were combined into the runtime RGBA atlas;
normal and roughness bytes are retained from the source. Bark runtime files are
copied from the source `branch_diff`, `branch_nor_gl`, and `branch_rough` channels.
The normal maps are OpenGL-oriented. No repainting, noise, AI generation, or
channel baking is used by the L9/L10 tree implementation.

## Reproducible acquisition

Run these existing scripts from `app` to restore and verify the shared assets:

```text
node scripts/fetch-l11-foliage.mjs
node scripts/fetch-l11-bark.mjs
```

The scripts record exact source URLs, checksums, dimensions, byte counts, and
local paths in the manifests named above. They are shared with Level 11 so the
three levels cannot silently drift to different leaf or bark revisions.

## Project-owned tree geometry

`src/game/renderer/outdoorTrees.ts` builds the L9/L10 trees with parameterized
trunks, branch cylinders, and the L11 leaf-island geometry from
`src/game/renderer/l11FoliageGeometry.ts`. `l11FoliageGeometry()` selects intact
individual leaf islands from the atlas rather than stretching the complete atlas
over a card. The renderer creates six deterministic silhouettes:

`round`, `columnar`, `forked`, `spreading`, `windswept`, and `open`.

Each silhouette has four seeded branch arrangements. World position, level, and
the authored style/value select the form deterministically; L9 and L10 retain
their own scale, tint, wind response, and material quality settings. Geometry is
cached by level/form/arrangement, cloned for each instance, and disposed through
the normal tree instance lifecycle. These variations are procedural project
geometry and carry no external model license or attribution.

## Runtime UV and material handling

Leaf islands keep their atlas UVs and use two-sided alpha-tested materials.
Branches and trunks use world-independent bark UVs with the existing mipmap and
quality path. L10 additionally uses the existing leaf wind shader. The shared
maps are loaded through `outdoorTrees.ts`, while L9/L10 geometry remains separate
from L11 city placement and pruning logic.
