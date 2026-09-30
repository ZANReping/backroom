# Level 10 PBR material manifest

All external maps below are ambientCG 1K-JPG assets distributed under CC0 1.0.
The game uses each asset's Color, NormalGL and Roughness channels. Source archives
are retained in `.cache/l10-cc0` for local provenance checks; runtime files are
renamed to the `l10_*_{diff,normal,rough}.jpg` convention.

| Runtime family | ambientCG asset | Source |
| --- | --- | --- |
| `l10_dry_soil` | Ground006 | https://ambientcg.com/view?id=Ground006 |
| `l10_wet_rut` | Ground071 | https://ambientcg.com/view?id=Ground071 |
| `l10_grass` | Grass004 | https://ambientcg.com/view?id=Grass004 |
| `l10_packed_dirt` | Ground009 | https://ambientcg.com/view?id=Ground009 |
| `l10_damp_shore` | Ground085 | https://ambientcg.com/view?id=Ground085 |
| `l10_wood` | Planks002 | https://ambientcg.com/view?id=Planks002 |
| `l10_metal` | MetalPlates006 | https://ambientcg.com/view?id=MetalPlates006 |
| `l10_foliage` | ScatteredLeaves009 | https://ambientcg.com/view?id=ScatteredLeaves009 |

`l10_wheat`, `l10_hedge` and `l10_hay` are deterministic original project maps generated
by `scripts/gen-l10-pbr.ts` and dedicated to the public domain under CC0-1.0.
The generator only fills missing slots, so it never overwrites downloaded
ambientCG channels. Run `npm run generate:l10-pbr` to restore absent fallbacks.

`l10_wheat_clump.png` and `l10_barley_clump.png` are original transparent
botanical cutouts generated for this project with OpenAI image generation on
2026-09-05, then resized to 512×768 for runtime use. They are not third-party
downloads and do not inherit the ambientCG CC0 attribution above.

Every family owns independent albedo, tangent-space normal and roughness maps,
so wet soil, crops, wood and metal do not share reflection parameters.
