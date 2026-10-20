"""脸图外缘清理（随机 NPC 池脸 / 有名 NPC 专属脸共用）。

源照片的头发会残留在脸图顶部两角和顶边（黑、灰、金……），与运行时按发色染色的
发壳颜色对不上；部分图在下颌两侧还有一道白色描边。这里把这些区域找出来，
用周围皮肤做修补（OpenCV Telea inpaint），脸部五官与肤色不动。

- 头发：顶部 46% 内、与图像边缘连通、且与额头/面颊肤色明显不同（亮度比 <0.74 或 >1.28，
  或色度偏离 >0.045）的像素。眉眼所在的中央条带（u 0.14–0.86, v 0.25–0.46）不参与。
- 白边：两侧 u<0.24 / u>0.76、v>0.5 的低饱和高亮像素（比肤色亮 18% 以上）。
"""
import numpy as np
import cv2


def _chroma(a):
    s = np.maximum(a.sum(axis=2, keepdims=True), 1)
    return a / s


def hair_mask(a):
    n = a.shape[0]
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    patches = [a[int(.47 * n):int(.56 * n), int(.17 * n):int(.27 * n)], a[int(.47 * n):int(.56 * n), int(.73 * n):int(.83 * n)],
               a[int(.15 * n):int(.24 * n), int(.40 * n):int(.60 * n)]]
    skin = np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)
    lum, slum = a.mean(axis=2), max(skin.mean(), 1)
    ratio = lum / slum
    cd = np.abs(_chroma(a) - skin / max(skin.sum(), 1)).sum(axis=2)
    off = (ratio < .74) | (ratio > 1.28) | (cd > .045)
    region = (ys < .46) & ~((xs > .14) & (xs < .86) & (ys > .25)) & ~((xs > .3) & (xs < .7) & (ys > .09))
    cand = (off & region).astype(np.uint8)
    # Keep only blobs touching the top or side border (eyebrows never do).
    count, lab = cv2.connectedComponents(cand, connectivity=8)
    border = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))) - {0}
    hair = np.isin(lab, list(border))
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    rim = ((xs < .24) | (xs > .76)) & (ys > .5) & (ratio > 1.18) & (sat < .2)
    k = max(3, n // 96)
    ker = np.ones((k, k), np.uint8)
    hair_only = cv2.dilate(hair.astype(np.uint8) * 255, ker)
    m = cv2.dilate((hair | rim).astype(np.uint8) * 255, ker)
    return m, skin, hair_only


def clean_face(a):
    """a: float32 RGB (n×n×3, 0–255). Returns the cleaned copy and the mask fraction."""
    m, _, _ = hair_mask(a)
    if not m.any():
        return a, 0.0
    img = np.clip(a, 0, 255).astype(np.uint8)
    out = cv2.inpaint(img, m, max(3, a.shape[0] // 64), cv2.INPAINT_TELEA)
    # Soft skin grain so the patch does not read as a flat airbrush.
    rng = np.random.default_rng(int(a.sum()) % (2 ** 32))
    grain = cv2.GaussianBlur(rng.normal(0, 3.2, a.shape[:2]).astype(np.float32), (0, 0), max(1, a.shape[0] / 256))
    w = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), max(1, a.shape[0] / 170))[:, :, None]
    res = out.astype(np.float32) + grain[:, :, None] * w
    return a * (1 - w) + res * w, float((m > 0).mean())


def hair_alpha(a):
    """头发区域 alpha（1 = 皮肤 / 0 = 头发），羽化；运行时脸材质把 alpha=0 处染成该角色的发色。"""
    _, _, h = hair_mask(a)
    w = cv2.GaussianBlur(h.astype(np.float32) / 255, (0, 0), max(1, a.shape[0] / 200))
    return 1 - np.clip(w * 1.15, 0, 1)


# ---------- v82：池脸发区重做（只用于随机 NPC 池脸）----------
# 旧版直接用照片里检测到的头发块做发区：两角留得太大（常到 v 0.3–0.45）、边缘锯齿/方块状，
# 运行时染成一块平涂发色，和皮肤的交界很生硬。这里改为：
#  1. 发区 = 一条平滑的发际线曲线（额中 v≈0.02–0.08，太阳穴 ≤0.15，最外缘 ≤0.22），
#     高度只参考照片检测结果并收紧上限；交界处带一排细碎发梢（逐列随机长短）与 0.035 的羽化。
#  2. 角落修补：Telea 修补在大块区域会拉出条纹，改为「低频取修补结果的大半径模糊 + 高频借额头皮肤纹理」。
def _hair_extent(h, n, u0, u1, vmax):
    """列带 [u0,u1) 内照片头发向下延伸到的 v（取 70 分位），没有则 None"""
    cols = h[:int(vmax * n), int(u0 * n):int(u1 * n)] > 0
    if not cols.any():
        return None
    depth = []
    for c in range(cols.shape[1]):
        r = np.nonzero(cols[:, c])[0]
        if len(r):
            depth.append((r.max() + 1) / n)
    return float(np.percentile(depth, 70)) if depth else None


def pool_hairline_alpha(a, seed=0):
    """池脸发区 alpha（1 = 皮肤 / 0 = 头发）：平滑发际线 + 细碎发梢 + 羽化"""
    n = a.shape[0]
    _, _, h = hair_mask(a)
    hc = _hair_extent(h, n, 0.42, 0.58, 0.2)
    hc = 0.03 if hc is None else min(0.06, max(0.015, hc * 0.7))
    tl = _hair_extent(h, n, 0.06, 0.18, 0.5)
    tr = _hair_extent(h, n, 0.82, 0.94, 0.5)
    tm = [t for t in (tl, tr) if t is not None]
    ht = min(0.15, max(0.09, (np.mean(tm) * 0.45) if tm else 0.11))
    u = (np.arange(n) + 0.5) / n
    x = np.abs(u - 0.5)
    inner = hc + (ht - hc) * np.clip(x / 0.36, 0, 1) ** 2.2
    outer = ht + (0.22 - ht) * np.clip((x - 0.36) / 0.14, 0, 1) ** 1.5
    vh = np.where(x < 0.36, inner, outer)
    rng = np.random.default_rng(seed)
    # 发梢：逐列随机长短（平滑过的低频起伏 + 高频细碎），只往下长
    low = cv2.GaussianBlur(rng.normal(0, 1, (1, n)).astype(np.float32), (0, 0), n / 40)[0]
    low = low / max(1e-6, np.abs(low).max()) * 0.008
    fine = np.clip(rng.normal(0, 1, n), 0, None) * 0.009 * (rng.random(n) < 0.55)
    fine = cv2.GaussianBlur(fine.astype(np.float32)[None], (0, 0), max(0.6, n / 512))[0]
    vh = vh + low + fine
    v = (np.arange(n) + 0.5)[:, None] / n
    feather = 0.035
    t = np.clip((v - vh[None]) / feather + 0.15, 0, 1)
    alpha = t * t * (3 - 2 * t)
    return alpha.astype(np.float32)


def clean_face_smooth(a):
    """clean_face 的池脸版本：修补区用低频模糊 + 额头皮肤高频纹理，避免 Telea 条纹"""
    m, _, _ = hair_mask(a)
    if not m.any():
        return a, 0.0
    n = a.shape[0]
    img = np.clip(a, 0, 255).astype(np.uint8)
    out = cv2.inpaint(img, m, max(3, n // 64), cv2.INPAINT_TELEA).astype(np.float32)
    lo = cv2.GaussianBlur(out, (0, 0), n / 22)
    # 额头皮肤纹理（高频），镜像平铺到整张
    p = a[int(0.13 * n):int(0.24 * n), int(0.36 * n):int(0.64 * n)].astype(np.float32)
    hp = p - cv2.GaussianBlur(p, (0, 0), max(1.2, n / 170))  # 只借毛孔级细节，不带皱纹
    tile = np.concatenate([hp, hp[:, ::-1]], 1)
    tile = np.concatenate([tile, tile[::-1]], 0)
    reps = (n // tile.shape[0] + 2, n // tile.shape[1] + 2, 1)
    det = np.tile(tile, reps)[:n, :n]
    fill = lo + det * 0.7
    w = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), max(1, n / 120))[:, :, None]
    return a * (1 - w) + fill * w, float((m > 0).mean())
