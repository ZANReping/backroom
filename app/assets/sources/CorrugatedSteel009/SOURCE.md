# CorrugatedSteel009 — Level 1 roof

- Author/provider: Lennart Demes / ambientCG.
- Asset: https://ambientcg.com/view?id=CorrugatedSteel009
- Original archive: https://ambientcg.com/get?file=CorrugatedSteel009_1K-JPG.zip
- License: **CC0 1.0 Universal**, https://docs.ambientcg.com/license/ and https://creativecommons.org/publicdomain/zero/1.0/.
- Retrieved 2026-10-09. Archive SHA-256: `fa917cba8bbf4ceb645cf27e4c1a4a17621d3b1ad44a4125997cdd05662711fb`.
- Original Color, NormalGL and Roughness JPEGs are retained in this directory.
- Processing: `node scripts/prepare-l1-steel.mjs` in `app`. Resize each original to 512²; renormalize the resized OpenGL normal; JPEG quality 92. No green-channel inversion.
- Runtime files: `public/textures/l1/steel.jpg`, `steel_normal.jpg`, `steel_roughness.jpg`. Renderer keeps mipmaps, world-scale UV and roughness loading by material mode. Roof repeat is .45/m; tint/lightness remapping is in `l1Materials.ts` and does not alter the original images.
- Reference: `reference/L1/跃金段.jpg`. The rib pattern replaces the former smooth generic roof; beam/duct orientation and illumination are separate geometry/bake changes. This is an openly licensed scanned asset, not an AI-generated texture.
