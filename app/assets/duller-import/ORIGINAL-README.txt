钝人（Entity 6）重制 v63.1（头部按附图修正）
应用顺序：smiler-remake.patch（backroom-smiler.zip）→ hound-remake.patch（backroom-hound.zip）→ duller-remake.patch
验收：cd app && npx esbuild scripts/check-dullers.ts --bundle --platform=node --format=esm --outfile=.cache/cd.mjs && node .cache/cd.mjs
详见 DULLER-REMAKE.md
