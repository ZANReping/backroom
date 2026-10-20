# Rat import source record

- Source: user-provided ZIP archive `backroom-rat-v79-v80.zip`.
- Original local path: `C:\Users\ZANRe\Downloads\backroom-rat-v79-v80.zip`.
- Imported: 2026-10-15.
- Original package marker: v79/v80.
- ZIP SHA-256: `008ee59aca1fb7bf272f949316b38fc76dd6c049f4722db9e8807a5b51fe412c`.
- Author/license: original package not marked with a specific author or license (`原包未标明`).
- Models, textures, and sound effects: according to the included `app/RAT-REMAKE.md`, all are procedurally generated at runtime with no external art assets.
- Reference: the included `app/RAT-REMAKE.md` is retained in the archive source and is the basis for this record.
- Integration note: this project record preserves the existing incremental merge approach, including flight, entity classification, and loading optimizations. Multiplayer remains frozen per project instructions.

The `previews/` directory contains the two package preview images for visual comparison. `manifest.json` records SHA-256 and byte size for every file under the package's `overlay/` directory.

The previews include upstream reference imagery; those images are retained as package evidence, not used as game textures. No separate author or redistribution license for that reference imagery was supplied.

Local modifications: material-factory integration, shared texture ownership and cooperative preparation, safe batching/disposal, stable developer form IDs and legacy morph aliases, injured capybara initialization, same-height device interactions, and existing chunk-item integration for meat drops. Runtime paths include `src/game/renderer/ratMesh.ts`, `src/game/engine/ratAI.ts`, `src/game/entities/rats.ts`, `src/proto/ratProto.ts`, and `public/textures/icons/pixel/item_ratmeat.png`. Details and actual-game verification are in `reports/rat-v80/REPORT.md`.
