#!/usr/bin/env bash
# 下载 Level 0.2 PBR 材质的 CC0 原始扫描包（不入库，体积约 300 MB）。
# 用法：SRC=/path/to/l02-pbr-src bash app/scripts/fetch-l02-pbr-sources.sh
# 然后：SRC=... python3 app/scripts/gen-l02-pbr.py
# 来源与许可登记见 app/public/textures/l02/SOURCES.md（ambientCG / Poly Haven，均为 CC0 1.0）。
set -euo pipefail
SRC="${SRC:-./l02-pbr-src}"
mkdir -p "$SRC"; cd "$SRC"
acg() { # ambientCG：id + 分辨率
  local id="$1" res="$2" dir="$3"
  [ -f "$dir/${id}_${res}-JPG_Color.jpg" ] && return 0
  curl -fsSL -o "$dir.zip" "https://ambientcg.com/get?file=${id}_${res}-JPG.zip"
  mkdir -p "$dir"; unzip -oq "$dir.zip" -d "$dir"
}
acg Carpet013 2K Carpet013
acg OfficeCeiling001 4K OC4K
acg Wallpaper001A 2K Wallpaper001A
acg Rubber004 2K Rubber004
acg Wood049 2K Wood049
acg Fabric084 2K Fabric084
# Poly Haven：Oriented Strand Board（Dimitrios Savva）
for m in diff nor_gl rough ao disp; do
  [ -f "osb_$m.jpg" ] || curl -fsSL -o "osb_$m.jpg" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/oriented_strand_board/oriented_strand_board_${m}_2k.jpg"
done
echo "sources ready in $SRC"
