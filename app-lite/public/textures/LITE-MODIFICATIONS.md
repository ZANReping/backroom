# Lite asset processing

2026-10-09: Assets retain their original authors, source URLs and licenses in adjacent SOURCES.md files. No source attribution has been replaced.

The Lite distribution resizes ordinary images to a 512 px maximum edge, while signs/posters/labels use up to 1024 px. Larger PNGs are palette encoded with transparency preserved. JPEGs use quality 75; normal-map JPEGs use quality 80 without chroma subsampling. Generated atlas UV coordinates retain the source coordinate system. Fonts are subset to source text and retain their original license notices.

Reproduce with `scripts/optimize-lite-images-fonts.py` against the read-only sibling `app`. Exact original/output sizes and dimensions are recorded in `reports/images-fonts.json` in the Lite source project.

Level 1's optional offline lighting cache (105,966,105 bytes, one showcase seed) is omitted. The original Worker computes missing data at runtime and persists it in IndexedDB.
