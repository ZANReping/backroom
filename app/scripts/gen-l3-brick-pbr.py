#!/usr/bin/env python3
"""从 l3_wall.jpg 生成与颜色图严格对齐的 L3 砖墙 PBR 辅图与暗区颜色变体。"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / "public" / "textures"


def save_rgb(array: np.ndarray, name: str, quality: int = 91) -> None:
    Image.fromarray(np.uint8(np.clip(array, 0, 255)), "RGB").save(TEX / name, quality=quality)
    print("written", name)


def main() -> None:
    color = Image.open(TEX / "l3_wall.jpg").convert("RGB")
    rgb = np.asarray(color, dtype=np.float32) / 255.0
    # 暖棕灰浆比红砖暗：亮度近似高度（亮砖凸、暗灰浆凹）；轻模糊保留砖缝轮廓，
    # 削弱颜色噪点造成的假凹凸。
    lum = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
    height = np.asarray(
        Image.fromarray(np.uint8(lum * 255), "L").filter(ImageFilter.GaussianBlur(1.1)),
        dtype=np.float32,
    ) / 255.0
    # 周期中心差分确保 normal 图本身也可无缝平铺；OpenGL normal：+Y（绿色）向上。
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 2.1
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 2.1
    nz = np.ones_like(height) * 0.72
    inv = 1.0 / np.sqrt(dx * dx + dy * dy + nz * nz)
    normal = np.stack((-dx * inv, dy * inv, nz * inv), axis=-1) * 0.5 + 0.5
    save_rgb(normal * 255.0, "l3_wall_normal.jpg", 93)

    # 砖体粗糙、灰浆更粗糙；红通道越强越像烧结砖面，给予轻微反射差异但绝不做湿亮砖。
    brick_score = np.clip(rgb[..., 0] - (rgb[..., 1] + rgb[..., 2]) * 0.5, 0.0, 1.0)
    rough = np.clip(0.92 - brick_score * 0.20 + (1.0 - height) * 0.06, 0.68, 0.98)
    rough = np.asarray(
        Image.fromarray(np.uint8(rough * 255), "L").filter(ImageFilter.GaussianBlur(0.75)),
        dtype=np.uint8,
    )
    Image.merge("RGB", (Image.fromarray(rough),) * 3).save(TEX / "l3_wall_roughness.jpg", quality=91)
    print("written l3_wall_roughness.jpg")

    # 晦暗变体保留同一红黄砖色族，只做适度压暗，避免暗区变成几乎全黑的灰褐墙。
    dark = ImageEnhance.Color(color).enhance(0.84)
    dark = ImageEnhance.Brightness(dark).enhance(0.78)
    dark.save(TEX / "l3_wall2.jpg", quality=90)
    print("written l3_wall2.jpg")


if __name__ == "__main__":
    main()
