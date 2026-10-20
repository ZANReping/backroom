Level 10「丰裕」重制（v64）+ 通用水体
应用顺序（在基线上）：
  1. smiler-remake.patch  2. hound-remake.patch  3. duller-remake.patch  4. l10-remake.patch
  git apply l10-remake.patch
验收：npx esbuild scripts/check-l10-generation.ts --bundle --platform=node --format=esm --outfile=.cache/cl10.mjs && node .cache/cl10.mjs
说明见 L10-REMAKE.md；previews/ 为无头 Chromium 实机截图。
