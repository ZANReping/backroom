# Creeper import source record

- Source: user-provided ZIP archive `creeper-full.zip`.
- Original local path: `C:\Users\ZANRe\Downloads\creeper-full.zip`.
- Imported: 2026-10-25.
- ZIP size: 23,468,208 bytes.
- ZIP SHA-256: `5f73a4fc4e56598f6c46d9650ff0156eefee7abb0b5a9b502c595af0e90a60b0`.
- Extracted source directory: `C:\Users\ZANRe\AppData\Local\Temp\creeper-integration-20261025`.
- Extracted files retained as source evidence:
  - `creeper-full.patch`: 28,547,551 bytes; SHA-256 `4665b7cf905d909b6ec050b03240c71a4b185a413454a76a9679156dc6778096`.
  - `CREEPER-REMAKE.md`: 18,517 bytes; SHA-256 `11a7ff8e44e9308d9e7326c3213082d19f3a48e9ff78481ac05290a25b4d672b`.
  - `APPLY.md`: 2,976 bytes; SHA-256 `64e50b49ee8333ced108ed52dc7b1bf6fce37e8e70097728fe9f5b55061c6e6a`.
  - `creeper-stage3.jpg`: 544,066 bytes; SHA-256 `c6dac6ba74ae4e8966d15dc654f5fb2d71196866106b47d1eb6ab9a5c930ca08`.
- Package documentation claims baseline `032a79a` and stages `a99309a`, `a88c3a4`, and `c444baa`; these identifiers come from the package's own documentation and are not asserted to be real commits in this repository.
- Main added modules are procedural creeper modeling/animation/rendering and AI/world integration, including `src/game/renderer/creeperMesh.ts`, `src/game/renderer/creeperAnim.ts`, `src/game/renderer/creeperRender.ts`, `src/game/engine/creeperAI.ts`, and `src/game/world/chunkHooks.ts`, plus the documented integration points.
- No independent new textures or GLB assets are supplied: the creeper models are procedural and reuse existing corpse-rat/arachnid and hand resources. Existing resource licensing is retained.
- The package does not state a separate license. No license or redistribution permission is inferred or added here.
- The archive text is source material only; package commands were not executed as part of this record.

## Retained project evidence

The original design, application notes, and reference montage are copied here as `UPSTREAM-CREEPER-REMAKE.md`, `UPSTREAM-APPLY.md`, and `UPSTREAM-creeper-stage3.jpg`, with their original bytes and hashes. The large patch and ZIP remain at the local source paths recorded above; their historical binary reports were not copied into this project. The current integration uses adapted source rather than blindly replaying package commands.

Project adaptations include cooperative model jobs, existing GPU preparation, shared-resource ownership, hand/grip lifecycle, wall-supported decor, hearing and hit occlusion, current special-action/trade compatibility, fresh-run reset, persisted burnt decor, and dedicated infected-meat model/icon. The icon is code-authored locally; see `ICON.md` for its reproducible generator. No new third-party license is inferred.
