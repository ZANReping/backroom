"""前厅（Foyer）PBR 贴图预处理：Poly Haven CC0 1K JPG → public/textures/foyer/。
输入：RAW 目录下的 <id>_diff/_nor/_rough/_ao.jpg（由 Poly Haven API 1k jpg 下载，见 FOYER-ASSET-SOURCES.md）。
输出：<name>_col.jpg（sRGB 颜色）、<name>_nrm.jpg（OpenGL 法线，线性）、<name>_orm.jpg（R=AO、G=粗糙度、B=0，线性）。
tint=True 的套组：颜色图转为亮度归一化的灰度（均值≈0.78），由材质 color 着色（同一扫描用于多种布艺/漆色）。
用法：python3 prepare-foyer-textures.py RAW_DIR OUT_DIR
"""
import sys, os
from PIL import Image, ImageOps, ImageStat
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
# name, polyhaven id, size, tint, ao
SETS = [
  ('wood_floor', 'laminate_floor_02', 1024, False, True),
  ('stone_floor', 'marble_01', 1024, False, True),
  ('granite_tile', 'granite_tile_03', 1024, False, True),
  ('wall_tile', 'long_white_tiles', 1024, False, True),
  ('terrazzo', 'terrazzo_tiles', 1024, False, True),
  ('plaster', 'plastered_wall_04', 1024, True, False),
  ('wool', 'poly_wool_herringbone', 512, True, True),
  ('linen', 'rough_linen', 512, True, True),
  ('jersey', 'cotton_jersey', 512, True, True),
  ('velvet', 'velour_velvet', 512, True, True),
  ('oak', 'oak_veneer_01', 1024, False, False),
  ('walnut', 'walnut_veneer', 1024, False, False),
  ('maple', 'white_maple_veneer', 512, False, False),
]
def save(im, path, q):
    im.save(path, 'JPEG', quality=q, optimize=True, progressive=False)
for name, pid, size, tint, ao in SETS:
    diff = Image.open(f'{RAW}/{pid}_diff.jpg').convert('RGB').resize((size, size), Image.LANCZOS)
    if tint:
        g = ImageOps.grayscale(diff)
        mean = ImageStat.Stat(g).mean[0] / 255
        k = 0.78 / max(mean, 1e-3)
        g = g.point(lambda v: max(0, min(255, int(v * k))))
        # 降低对比度：保留织物纹理但不至于让着色后出现大块深色
        g = Image.blend(Image.new('L', g.size, int(0.78 * 255)), g, 0.7 if name != 'plaster' else 0.45)
        diff = g.convert('RGB')
    if name == 'granite_tile':
        # 卫生间浅灰防滑砖：原扫描偏深（均值≈0.37）。去饱和 60% 后提亮 x'=1-(1-x)*0.42（保留颗粒对比）
        lum = diff.convert('L').convert('RGB')
        diff = Image.blend(lum, diff, 0.4).point(lambda v: int(255 - (255 - v) * 0.42 + 0.5))
    if name == 'terrazzo':
        # 楼道旧水磨石：原扫描为暖棕底色。转灰度后加大石子对比（×1.6，均值 0.56），
        # 再偏冷（R×0.955、G×0.985、B×1.03），仅保留 6% 原始色相作石子杂色 → 冷灰水磨石
        g = ImageOps.grayscale(diff); m = ImageStat.Stat(g).mean[0]
        g = g.point(lambda v: max(0, min(255, int((v - m) * 1.6 + 0.56 * 255))))
        cool = Image.merge('RGB', (g.point(lambda v: int(v * 0.955)), g.point(lambda v: int(v * 0.985)), g.point(lambda v: min(255, int(v * 1.03 + 3)))))
        diff = Image.blend(cool, diff.point(lambda v: min(255, int(v * 1.25))), 0.06)
    save(diff, f'{OUT}/{name}_col.jpg', 86)
    nor = Image.open(f'{RAW}/{pid}_nor.jpg').convert('RGB').resize((size, size), Image.LANCZOS)
    save(nor, f'{OUT}/{name}_nrm.jpg', 90)
    rough = ImageOps.grayscale(Image.open(f'{RAW}/{pid}_rough.jpg')).resize((size, size), Image.LANCZOS)
    aoim = ImageOps.grayscale(Image.open(f'{RAW}/{pid}_ao.jpg')).resize((size, size), Image.LANCZOS) if ao and os.path.exists(f'{RAW}/{pid}_ao.jpg') else Image.new('L', (size, size), 255)
    orm = Image.merge('RGB', (aoim, rough, Image.new('L', (size, size), 0)))
    save(orm, f'{OUT}/{name}_orm.jpg', 88)
    print(name, 'ok')
