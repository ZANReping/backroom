# v53：L0 地板/天花板「仅贴图」改造——把渲染层叠乘的顶点色底色烘焙进贴图
#   l0_floor.jpg ×= pal.floor  #b8a548
#   l0_ceil.jpg  ×= pal.wallTop #8a7a33 × 0.55（geometry.ts 天花板基色 cc）
# 与着色器一致：贴图按 SRGBColorSpace 采样转线性、顶点色为线性值、线性空间相乘，
# 因此烘焙也在线性空间完成再转回 sRGB 存储，游戏内输出与改造前逐点一致。
# 输入为 _src_l0_*_prebake.jpg（改造前贴图备份），脚本幂等可重复执行。
# 用法：python scripts/gen-l0-bake.py
from PIL import Image
import os

TEX = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')


def srgb2lin(v: int) -> float:  # v: 0..255 → 线性 0..1（three.js SRGBToLinear 同式）
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin2srgb(L: float) -> int:  # 线性 0..1 → 0..255（three.js LinearToSRGB 同式）
    c = 1.055 * (L ** (1 / 2.4)) - 0.055 if L > 0.0031308 else 12.92 * L
    return max(0, min(255, round(c * 255)))


def bake(src: str, dst: str, mul: tuple) -> None:
    im = Image.open(os.path.join(TEX, src)).convert('RGB')
    bands = [im.getchannel(ch).point([lin2srgb(srgb2lin(v) * k) for v in range(256)])
             for ch, k in enumerate(mul)]
    Image.merge('RGB', bands).save(os.path.join(TEX, dst), quality=95, subsampling=0)
    print(f'{dst}: baked ×({mul[0]:.4f},{mul[1]:.4f},{mul[2]:.4f})')


FLOOR = tuple(srgb2lin(v) for v in (0xB8, 0xA5, 0x48))            # pal.floor #b8a548
CEIL = tuple(srgb2lin(v) * 0.55 for v in (0x8A, 0x7A, 0x33))      # pal.wallTop #8a7a33 ×0.55

bake('_src_l0_floor_prebake.jpg', 'l0_floor.jpg', FLOOR)
bake('_src_l0_ceil_prebake.jpg', 'l0_ceil.jpg', CEIL)

# 天花板离线回退色（烘焙底色的 sRGB hex）——填进 geometry.ts ceilMat 的 L0 fallback
print('ceil fallback hex: #%02x%02x%02x' % tuple(lin2srgb(v) for v in CEIL))
