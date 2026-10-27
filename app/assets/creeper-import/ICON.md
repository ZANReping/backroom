# Creeper meat icon

This icon is an original procedural pixel drawing for the creeper's long white-furred rat meat item. It is not copied from or derived by editing an existing PNG. The source canvas is 32×32 and is enlarged to 128×128 with image smoothing disabled (nearest-neighbour). The drawing uses a dark red-brown narrow meat strip, pale bone, sparse rice/grey-white fur clumps, deep-brown outline, and a small upper-left highlight so it remains distinct from the ordinary rat-meat icon when reduced.

- Output: `app/public/textures/icons/pixel/item_creepmeat.png`
- Generator: `app/scripts/gen-creeper-icon.mjs`
- Reproduce from `app/` with: `node scripts/gen-creeper-icon.mjs`
- Rendering dependency: `@napi-rs/canvas`
- Validation: the generator reloads the PNG, checks 128×128 dimensions, and requires transparent pixels.
