#!/usr/bin/env python3
"""Level 0.2 PBR 材质生成（2026-10-25 PBR 返工）。

输入：ambientCG / Poly Haven 的 CC0 扫描包（先运行 fetch-l02-pbr-sources.sh 下载到 $SRC，不入库）。
输出：app/public/textures/l02/<mat>.jpg（albedo，sRGB）、<mat>-normal.jpg（OpenGL +Y 法线）、
      <mat>-orm.jpg（R=AO，G=roughness，B=高度；线性数据）+ manifest.json。
材质：carpet / ceiling / wall / trim（防撞条）/ osb / stud（龙骨）/ insul（保温棉）。

颜色策略：albedo 的均值标定到旧版贴图的均值（carpet/wall/trim），因此运行时 tint 不变就能得到同样的颜色；
吊顶标定到 Level 0 本体 l0-remake/ceiling.png 的均值（暖米黄），运行时 tint 再按同机位截图微调。
确定性：所有随机量用固定种子；同样的源文件 → 同样的输出（manifest 记录源文件 SHA-256）。
依赖：Python 3 + numpy + scipy + Pillow。
用法：SRC=/path/to/l02-pbr-src python3 app/scripts/gen-l02-pbr.py
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFile
ImageFile.MAXBLOCK = 1 << 26  # 2048² 大图 optimize 编码需要更大的输出缓冲
from scipy.ndimage import gaussian_filter

SRC = os.environ.get('SRC', './l02-pbr-src')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'textures', 'l02')
os.makedirs(OUT, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
manifest = []

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def load(name, mode='RGB'):
    p = os.path.join(SRC, name)
    return np.asarray(Image.open(p).convert(mode), dtype=np.float32) / 255.0, p

def rs(a, w, h):
    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((w, h), Image.LANCZOS))
    return np.stack([rs(a[..., c], w, h) for c in range(a.shape[2])], -1)

def ndec(a): return a * 2.0 - 1.0
def nnorm(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
def nenc(v): return np.clip(nnorm(v) * 0.5 + 0.5, 0, 1)
def nscale(v, s):
    v = v.copy(); v[..., 0] *= s; v[..., 1] *= s; return nnorm(v)
def nresize(v, w, h): return nnorm(rs(v, w, h))
def ncombine(a, b):  # 细节法线叠加（UDN）
    return nnorm(np.stack([a[..., 0] + b[..., 0], a[..., 1] + b[..., 1], a[..., 2] * b[..., 2]], -1))

def h2n(h, s):
    """周期高度图 → OpenGL 法线（图像行向下 = v 向下，故 n.y 取 +dh/drow）。"""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    return nnorm(np.stack([-gx * s, gy * s, np.ones_like(h)], -1))

def pnoise(h, w, cells, seed, power=2.0):
    """周期低频噪声（FFT 低通），输出 0..1，无缝。cells≈图内特征个数。"""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h; fx = np.fft.fftfreq(w)[None, :] * w
    r = np.sqrt(fx * fx + fy * fy)
    amp = np.where(r > 0, 1.0 / (1.0 + (r / cells) ** power) / np.maximum(r, 1) ** 0.5, 0)
    amp[r > cells * 4] = 0
    spec = amp * np.exp(2j * np.pi * rng.random((h, w)))
    n = np.real(np.fft.ifft2(spec))
    n -= n.min(); n /= max(n.max(), 1e-9); return n.astype(np.float32)

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def lum(c): return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722

def recolor_lum(c, target, contrast):
    """亮度比例上色：保留源图明暗细节（按 contrast 缩放），色相统一到 target，均值精确等于 target。"""
    l = lum(c); r = 1.0 + (l / l.mean(dtype=np.float64) - 1.0) * contrast
    out = np.array(target, np.float32)[None, None, :] / 255.0 * r[..., None]
    return fit_mean(out, target)

def fit_mean(c, target):
    t = np.array(target, np.float32) / 255.0
    for _ in range(4):
        m = c.reshape(-1, 3).mean(0, dtype=np.float64); c = np.clip(c * (t / np.maximum(m, 1e-4)), 0, 1)
    return c

def cavity_ao(h, sigma, k, lo=0.55):
    return np.clip(1.0 - k * np.clip(gaussian_filter(h, sigma, mode='wrap') - h, 0, None), lo, 1.0)

def save_rgb(a, name, q, sub):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, name), quality=q, subsampling=sub, optimize=True)

def save_set(mat, color, normal, ao, rough, height, sizes, srcs, process, bnote='height', raw_b=False):
    cw, nw, ow = sizes  # 每个通道的输出边长（宽；高按比例）
    H, W = color.shape[:2]; asp = H / W
    save_rgb(rs(color, cw, int(cw * asp)), f'{mat}.jpg', 88, 1)
    save_rgb(nenc(nresize(normal, nw, int(nw * asp))), f'{mat}-normal.jpg', 88, 0)
    if raw_b: hh = height
    else: hh = height - height.min(); hh = hh / max(hh.max(), 1e-6)
    orm = np.stack([rs(ao, ow, int(ow * asp)), rs(rough, ow, int(ow * asp)), rs(hh, ow, int(ow * asp))], -1)
    save_rgb(orm, f'{mat}-orm.jpg', 90, 0)
    m = color.reshape(-1, 3).mean(0, dtype=np.float64) * 255
    manifest.append({'material': mat, 'files': {'albedo': f'{mat}.jpg', 'normal': f'{mat}-normal.jpg', 'orm': f'{mat}-orm.jpg'},
                     'size': {'albedo': [cw, int(cw * asp)], 'normal': [nw, int(nw * asp)], 'orm': [ow, int(ow * asp)]},
                     'albedoMean': [round(float(v), 1) for v in m], 'normalConvention': 'OpenGL +Y', 'orm': 'R=AO G=roughness B=' + bnote,
                     'sources': [{'file': os.path.relpath(p, SRC), 'sha256': sha(p)} for p in srcs], 'process': process})
    print(mat, 'albedo mean', [round(float(v), 1) for v in m], flush=True)

def stamp(color, lines, rot=0, alpha=0.8):
    """把印字（RGBA 图层）按 alpha 叠到颜色图上。lines: [(text,x,y,size,(r,g,b))]"""
    H, W = color.shape[:2]
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for t, x, y, s, rgb in lines:
        f = ImageFont.truetype(FONT, s)
        if rot:
            tw = int(d.textlength(t, font=f)) + 8; tl = Image.new('RGBA', (tw, s + 10), (0, 0, 0, 0))
            ImageDraw.Draw(tl).text((4, 2), t, font=f, fill=rgb + (255,)); tl = tl.rotate(rot, expand=True)
            layer.alpha_composite(tl, (int(x - tl.width / 2), int(y - tl.height / 2)))
        else:
            d.text((x, y), t, font=f, fill=rgb + (255,))
    a = np.asarray(layer, np.float32) / 255.0
    k = a[..., 3:4] * alpha
    # 油墨渗进纤维：用源图亮度做一点斑驳
    k = k * (0.75 + 0.25 * (lum(color)[..., None] / max(lum(color).mean(), 1e-3)))
    return color * (1 - k) + a[..., :3] * k, a[..., 3]

# ---------------------------------------------------------------- 地毯
def carpet():
    C, pc = load('Carpet013/Carpet013_2K-JPG_Color.jpg'); N, pn = load('Carpet013/Carpet013_2K-JPG_NormalGL.jpg')
    R, pr = load('Carpet013/Carpet013_2K-JPG_Roughness.jpg', 'L'); A, pa = load('Carpet013/Carpet013_2K-JPG_AmbientOcclusion.jpg', 'L')
    D, pd = load('Carpet013/Carpet013_2K-JPG_Displacement.jpg', 'L')
    # 运行时一张图 = 1.5 m（L0.2 地毯 UV 1/1.5）；源图按 0.75 m 一块平铺 2×2 → 1024²（≈1.5 mm/px，绒头约 4–8 mm）
    S = 1024; t = 512
    tl = lambda a: np.tile(rs(a, t, t), (2, 2) if a.ndim == 2 else (2, 2, 1))
    C, R, A, D = tl(C), tl(R), tl(A), tl(D); N = nnorm(tl(ndec(N)))
    col = recolor_lum(C, [112, 48, 44], 0.55)
    N = nscale(N, 1.15)
    # 宏观磨损/旧渍不烘进 1.5 m 周期的颜色图（会看出重复），而是写进 ORM 的 B 通道：
    # 运行时按 uv×0.3125（周期 4.8 m，与 1.5 m 不成整数比）采样，驱动人流带变浅偏灰、绒头倒伏（法线起伏减弱）与偏棕旧渍。
    # B = 0.5 + 0.5·wear − 0.45·stain（0.5 = 中性）
    M = 512; lanes = pnoise(M, M, 2.2, 11); mid = pnoise(M, M, 9, 12)
    wear = smooth(0.52, 0.86, lanes * 0.8 + mid * 0.2)
    rng = np.random.default_rng(13); yy, xx = np.mgrid[0:M, 0:M].astype(np.float32); stain = np.zeros((M, M), np.float32)
    for _ in range(6):
        cx, cy, r = rng.random() * M, rng.random() * M, 5 + rng.random() * 9
        dx = np.minimum(np.abs(xx - cx), M - np.abs(xx - cx)); dy = np.minimum(np.abs(yy - cy), M - np.abs(yy - cy))
        stain = np.maximum(stain, np.exp(-(dx * dx + dy * dy) / (2 * r * r)) * (0.5 + 0.5 * rng.random()))
    stain *= 0.6 + 0.4 * pnoise(M, M, 40, 14)
    macro = np.clip(0.5 + 0.5 * wear - 0.45 * stain * (1 - wear), 0, 1)
    save_set('carpet', col, N, A, R, rs(macro, S, S), (1024, 1024, 512), [pc, pn, pr, pa, pd],
             'ambientCG Carpet013 2K：缩放到 512 px 平铺 2×2 → 1024²（=1.5 m）；亮度比例上色到旧均值 [112,48,44]（对比 0.55）；法线 ×1.15；'
             'ORM.B 为程序宏观磨损掩码（周期低频人流带 + 6 处旧渍，0.5 中性），运行时以 4.8 m 周期采样驱动磨损变浅偏灰/绒头倒伏/旧渍',
             bnote='宏观磨损掩码（0.5 中性，>0.5 人流磨损，<0.5 旧渍）', raw_b=True)

# ---------------------------------------------------------------- 吊顶
def ceiling():
    files = {k: f'OC4K/OfficeCeiling001_4K-JPG_{k}.jpg' for k in ['Color', 'NormalGL', 'Roughness', 'AmbientOcclusion', 'Displacement']}
    C, pc = load(files['Color']); N, pn = load(files['NormalGL']); R, pr = load(files['Roughness'], 'L')
    A, pa = load(files['AmbientOcclusion'], 'L'); D, pd = load(files['Displacement'], 'L'); N = ndec(N)
    # 源图 6×6 块（3.85 m），网格中心 k×682.67 px。取两块宽、一块高（含四周半条龙骨）= 1200×600 mm 的一张板。
    x0, x1, y0, y1 = 682, 2048, 682, 1365
    crop = lambda a: a[y0:y1, x0:x1].copy()
    # 中间那条竖龙骨（全图 x≈1365）用同一行另一块板的内部（x≈3000 起）羽化覆盖，变成一整张 1200 mm 板
    mid = 1365 - x0; core = 24; fe = 18; srcx = 3000
    wgt = np.zeros(x1 - x0, np.float32)
    for i in range(x1 - x0):
        d = abs(i - mid); wgt[i] = 1.0 if d <= core else max(0.0, 1 - (d - core) / fe)
    def patch(a):
        c = crop(a); lo = mid - core - fe; hi = mid + core + fe + 1
        src = a[y0:y1, srcx:srcx + (hi - lo)]
        w = wgt[lo:hi][None, :] if a.ndim == 2 else wgt[lo:hi][None, :, None]
        c[:, lo:hi] = c[:, lo:hi] * (1 - w) + src * w; return c
    C, R, A, D = patch(C), patch(R), patch(A), patch(D); N = nnorm(patch(N))
    W2, H2 = 2048, 1024
    C, R, A, D = rs(C, W2, H2), rs(R, W2, H2), rs(A, W2, H2), rs(D, W2, H2); N = nresize(N, W2, H2)
    # 矿棉孔洞在 albedo 里也略暗一点（经典光照模式没有 AO 时也能看到）
    A2 = np.clip(A, 0, 1); C = C * (0.72 + 0.28 * A2[..., None])
    # 板缝：龙骨两侧的企口台阶加一道细阴影（AO）
    xx = np.arange(W2)[None, :]; yy = np.arange(H2)[:, None]
    bar = 22 * W2 / 1366  # 半条龙骨宽（px）
    dist = np.minimum(np.minimum(xx, W2 - 1 - xx), np.minimum(yy, H2 - 1 - yy) * 1.0)
    groove = np.exp(-((dist - bar - 3) / 3.0) ** 2) * (dist > bar)
    A = np.clip(A * (1 - 0.35 * groove), 0, 1)
    N = nscale(N, 1.3)
    target = [192, 180, 132]  # Level 0 本体 l0-remake/ceiling.png 的均值（暖米黄）
    col = recolor_lum(C, target, 1.0)
    save_set('ceiling', col, N, A, R, D, (1024, 1536, 1024), [pc, pn, pr, pa, pd],
             'ambientCG OfficeCeiling001 4K（6×6 块 64 cm 矿棉板）：裁两块宽一块高 = 一张 1200×600 板（四周各半条龙骨，平铺后成整条），'
             '中间竖龙骨用同排另一块板内部羽化覆盖；工作分辨率 2048×1024（输出 albedo/ORM 1024×512、法线 1536×768）；albedo ×(0.72+0.28·AO) 使孔洞略暗；龙骨两侧企口加细 AO 阴影；'
             '法线 ×1.3；亮度比例上色到 Level 0 吊顶均值 [192,180,132]（暖米黄，对比 1.0）')

# ---------------------------------------------------------------- 墙
def wall():
    C, pc = load('Wallpaper001A/Wallpaper001A_2K-JPG_Color.jpg'); N, pn = load('Wallpaper001A/Wallpaper001A_2K-JPG_NormalGL.jpg')
    R, pr = load('Wallpaper001A/Wallpaper001A_2K-JPG_Roughness.jpg', 'L'); D, pd = load('Wallpaper001A/Wallpaper001A_2K-JPG_Displacement.jpg', 'L')
    S = 1024  # 运行时一张图 = 1.11 m（L0.2 墙 UV 0.9）；源图 1× 缩放到 1024²（≈1.1 mm/px）
    C, R, D = rs(C, S, S), rs(R, S, S), rs(D, S, S); N = nresize(ndec(N), S, S)
    # 乳胶漆/墙纸微起伏：低频大波 + 竖向滚刷波（程序派生，周期无缝）
    big = pnoise(S, S, 2, 21); roll = pnoise(S, S // 8, 5, 22); roll = np.repeat(rs(roll, S, S // 8), 8, 0)[:S]
    hlow = big * 1.0 + roll * 0.5
    N = ncombine(nscale(N, 1.25), h2n(hlow * 14.0, 1.0))
    A = cavity_ao(D, 2, 2.2, 0.7)
    C = C * (0.85 + 0.15 * A[..., None])
    col = recolor_lum(C, [227, 223, 205], 1.0)
    save_set('wall', col, N, A, R, D, (1024, 1024, 512), [pc, pn, pr, pd],
             'ambientCG Wallpaper001A 2K（压纹墙纸/乳胶漆面）1× 缩放到 1024²（=1.11 m）；法线 ×1.25 叠加程序低频大波 + 竖向滚刷波；'
             'AO 由置换图凹处派生（σ=2）；albedo ×(0.85+0.15·AO)；亮度比例上色到旧均值 [227,223,205]')

# ---------------------------------------------------------------- 防撞条
def trim():
    C, pc = load('Rubber004/Rubber004_2K-JPG_Color.jpg'); N, pn = load('Rubber004/Rubber004_2K-JPG_NormalGL.jpg')
    R, pr = load('Rubber004/Rubber004_2K-JPG_Roughness.jpg', 'L'); D, pd = load('Rubber004/Rubber004_2K-JPG_Displacement.jpg', 'L')
    S = 1024  # 运行时一张图 = 1.33 m；源 75 cm 平铺 2×2
    t2 = lambda a: rs(np.tile(a, (2, 2) if a.ndim == 2 else (2, 2, 1)), S, S)
    C, R, D = t2(C), t2(R), t2(D); N = nnorm(t2(ndec(N)))
    A = cavity_ao(D, 2, 2.0, 0.75)
    col = recolor_lum(C, [227, 223, 205], 0.35)  # 与旧版（乘在墙面贴图上）同均值 → tint #6e423a 结果不变
    save_set('trim', col, N, A, R, D, (512, 512, 256), [pc, pn, pr, pd],
             'ambientCG Rubber004 2K 平铺 2×2 → 512²（=1.33 m）；亮度比例上色到旧均值 [227,223,205]（对比 0.35，运行时 tint 乘成深红棕）；AO 由置换图派生')

# ---------------------------------------------------------------- OSB
def osb():
    C, pc = load('osb_diff.jpg'); N, pn = load('osb_nor_gl.jpg'); R, pr = load('osb_rough.jpg', 'L')
    A, pa = load('osb_ao.jpg', 'L'); D, pd = load('osb_disp.jpg', 'L')
    # Poly Haven 实物 2.51 m / 2048 px；运行时一张图 = 1.22 m（一张板）→ 裁 1000 px（≈1.22 m）缩放到 1024²，四周画锯边板缝
    c = lambda a: a[200:1200, 400:1400]
    C, R, A, D = rs(c(C), 1024, 1024), rs(c(R), 1024, 1024), rs(c(A), 1024, 1024), rs(c(D), 1024, 1024); N = nresize(ndec(c(N)), 1024, 1024)
    m = C.reshape(-1, 3).mean(0, dtype=np.float64); C = np.clip(C * (np.array([184, 146, 98]) / 255.0 / m), 0, 1)  # 通道增益：保留刨花色差
    S = 1024; xx = np.arange(S)[None, :]; yy = np.arange(S)[:, None]
    e = np.minimum(np.minimum(xx, S - 1 - xx), np.minimum(yy, S - 1 - yy)).astype(np.float32)
    seam = np.exp(-(e / 2.5) ** 2)
    C = C * (1 - 0.55 * seam[..., None]); A = A * (1 - 0.6 * seam); D = D * (1 - 0.5 * seam)
    N = ncombine(N, h2n(-seam * 6, 1.0))
    C, ink = stamp(C, [('BRC  OSB/3  18mm', 72, 140, 52, (44, 79, 138)), ('EN 300 · E1 · 2440×1220 · SHEATHING', 72, 205, 34, (44, 79, 138)),
                       ('↑ THIS SIDE UP ↑', 600, 860, 36, (170, 40, 40))], alpha=0.82)
    R = np.clip(R * (1 - 0.15 * ink), 0, 1)
    save_set('osb', C, N, A, R, D, (1024, 1024, 512), [pc, pn, pr, pa, pd],
             'Poly Haven oriented_strand_board 2K（2.51 m）：裁 1000 px ≈1.22 m 缩放到 1024²；通道增益到 [184,146,98]；四周 2.5 px 锯边板缝（颜色/AO/高度/法线）；'
             '印字两行 + “THIS SIDE UP”（DejaVu Sans Bold，油墨 α0.82，随刨花亮度斑驳）')

# ---------------------------------------------------------------- 龙骨
def stud():
    C, pc = load('Wood049/Wood049_2K-JPG_Color.jpg'); N, pn = load('Wood049/Wood049_2K-JPG_NormalGL.jpg')
    R, pr = load('Wood049/Wood049_2K-JPG_Roughness.jpg', 'L'); D, pd = load('Wood049/Wood049_2K-JPG_Displacement.jpg', 'L')
    # 源纹理木纹水平 → 转 90° 让顺纹竖直（龙骨竖立）。法线随之旋转：(x,y)→(y,-x)
    rot = lambda a: np.rot90(a, 1).copy()
    C, R, D = rot(C), rot(R), rot(D); N = ndec(rot(N)); N = np.stack([-N[..., 1], N[..., 0], N[..., 2]], -1)
    S = 1024; C, R, D = rs(C, S, S), rs(R, S, S), rs(D, S, S); N = nresize(N, S, S)
    m = C.reshape(-1, 3).mean(0, dtype=np.float64); C = np.clip(C * (np.array([206, 172, 118]) / 255.0 / m), 0, 1)  # SPF 浅色规格材
    C = 0.55 * C + 0.45 * fit_mean(np.repeat(lum(C)[..., None], 3, -1) * np.array([1.08, 0.94, 0.72]), [206, 172, 118])  # 降低木纹对比
    A = cavity_ao(D, 3, 1.6, 0.75)
    lines = []
    for i, x in enumerate(range(64, S, 256)):
        lines.append(('SPF  No.2  KD-HT  BRC', x, 300 + (i % 2) * 380, 30, (40, 60, 120)))
    C, ink = stamp(C, lines, rot=90, alpha=0.55)
    save_set('stud', C, N, A, R, D, (1024, 512, 512), [pc, pn, pr, pd],
             'ambientCG Wood049 2K（80 cm）旋转 90° 使顺纹竖直（法线同步旋转）→ 1024²（=0.6 m）；通道增益到 SPF 浅色 [206,172,118] 并降低木纹对比；'
             'AO 由置换图派生；竖排等级印章（DejaVu Sans Bold，α0.55）')

# ---------------------------------------------------------------- 保温棉
def insul():
    C, pc = load('Fabric084/Fabric084_2K-JPG_Color.jpg'); N, pn = load('Fabric084/Fabric084_2K-JPG_NormalGL.jpg')
    R, pr = load('Fabric084/Fabric084_2K-JPG_Roughness.jpg', 'L'); A, pa = load('Fabric084/Fabric084_2K-JPG_AmbientOcclusion.jpg', 'L')
    D, pd = load('Fabric084/Fabric084_2K-JPG_Displacement.jpg', 'L')
    S = 1024  # 运行时一张图 = 0.6 m；源 30 cm 平铺 2×2
    t2 = lambda a: rs(np.tile(a, (2, 2) if a.ndim == 2 else (2, 2, 1)), S, S)
    C, R, A, D = t2(C), t2(R), t2(A), t2(D); N = nnorm(t2(ndec(N)))
    col = recolor_lum(C, [228, 188, 104], 1.6)
    hue = pnoise(S, S, 6, 31)[..., None]  # 玻璃棉粉黄色差
    col = col * (1 + 0.10 * (hue - 0.5) * np.array([0.6, 1.0, 1.8]))
    N = nscale(N, 1.4)
    # 两侧牛皮纸翻边（8%）+ 订书钉
    xx = np.arange(S)[None, :].repeat(S, 0); fl = (xx < 80) | (xx > S - 81)
    kraft = fit_mean(recolor_lum(np.repeat(pnoise(S, S, 120, 32)[..., None], 3, -1) * 0.3 + 0.7, [176, 138, 85], 0.6), [176, 138, 85])
    col = np.where(fl[..., None], kraft, col)
    flat = np.zeros_like(N); flat[..., 2] = 1
    crease = np.exp(-((xx - 76) / 2.0) ** 2) + np.exp(-((xx - (S - 77)) / 2.0) ** 2)
    N = np.where(fl[..., None], ncombine(flat, h2n(pnoise(S, S, 60, 33) * 4, 1.0)), N)
    A = np.where(fl, 0.95, A) * (1 - 0.45 * crease); R = np.where(fl, 0.78, R); D = np.where(fl, 0.4, D)
    for x in (30, S - 40):
        for y in range(60, S, 180):
            col[y:y + 24, x:x + 6] = [0.79, 0.80, 0.82]; R[y:y + 24, x:x + 6] = 0.35; A[y + 24:y + 27, x:x + 6] *= 0.6
    save_set('insul', np.clip(col, 0, 1), N, A, R, D, (512, 1024, 512), [pc, pn, pr, pa, pd],
             'ambientCG Fabric084 2K（30 cm 绒面）平铺 2×2 → 1024²（=0.6 m）；亮度比例上色到玻璃棉粉黄 [228,188,104]（对比 1.6）+ 低频色差；法线 ×1.4；'
             '两侧 8% 牛皮纸翻边（程序纸纹、折痕 AO）与订书钉（程序绘制）')

if __name__ == '__main__':
    only = sys.argv[1:]
    for f in [carpet, ceiling, wall, trim, osb, stud, insul]:
        if not only or f.__name__ in only: f()
    mp = os.path.join(OUT, 'manifest.json')
    old = json.load(open(mp)) if (only and os.path.exists(mp)) else []
    if isinstance(old, list):
        keep = [m for m in old if m.get('material') not in {x['material'] for x in manifest} and 'files' in m]
    else: keep = []
    json.dump(keep + manifest, open(mp, 'w'), ensure_ascii=False, indent=1)
    print('wrote', mp)
