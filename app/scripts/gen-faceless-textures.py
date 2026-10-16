#!/usr/bin/env python3
"""v75：通用无面灵脸面纹理（无五官），5 档肤色。

来源：同肤色档的池内女性写实脸照 pool/f{tier}-0/neutral.png（同一构图/landmarks = POOL_META，
所以 retroNpc 的 faceU/faceUVat 可直接用）。做法：
  1. 眉、眼、鼻、嘴（含鼻唇沟、人中）用椭圆遮罩挖掉；
  2. OpenCV Telea 修补 + 多轮高斯扩散，让周围皮肤的明暗自然长进去；
  3. 从脸颊高通取真实毛孔/斑点噪声平铺回填补区（否则像塑料）；
  4. 只留极淡的眼窝阴影（≈4%）与鼻梁高光——「本该有五官的地方是平的」。
输出 public/textures/npc-retro/faceless/t{tier}.png（128²，Nearest 采样）。
依赖：pip install numpy opencv-python-headless pillow
"""
import os, sys
import numpy as np, cv2

ROOT = os.path.join(os.path.dirname(__file__), '..')
POOL = os.path.join(ROOT, 'public/textures/npc-retro/pool')
OUT = os.path.join(ROOT, 'public/textures/npc-retro/faceless')
N = 128
# POOL_META.landmarks: [eyeV, noseV, mouthV, chinV, eyeL_u, eyeR_u]
EYE_V, NOSE_V, MOUTH_V, CHIN_V, EL, ER = 0.368, 0.597, 0.775, 0.975, 0.295, 0.705


def ell(m, cu, cv, ru, rv, val=1.0):
    yy, xx = np.mgrid[0:N, 0:N]
    d = ((xx + .5) / N - cu) ** 2 / ru ** 2 + ((yy + .5) / N - cv) ** 2 / rv ** 2
    m[d <= 1] = val


def soft(cu, cv, ru, rv):
    yy, xx = np.mgrid[0:N, 0:N]
    d = np.sqrt(((xx + .5) / N - cu) ** 2 / ru ** 2 + ((yy + .5) / N - cv) ** 2 / rv ** 2)
    return np.clip(1 - d, 0, 1) ** 1.5


def make(tier):
    src = cv2.imread(os.path.join(POOL, f'f{tier}-0', 'neutral.png'))[:, :, ::-1].astype(np.float32)
    # 先去掉照片里细亮线（下颌白色勾线、碎发高光）
    L = src.mean(2)
    hl = ((L - cv2.GaussianBlur(L, (0, 0), 2.5)) > 10).astype(np.uint8)
    hl = cv2.dilate(hl, np.ones((3, 3), np.uint8)) * 255
    src = cv2.inpaint(np.clip(src, 0, 255).astype(np.uint8), hl, 3, cv2.INPAINT_TELEA).astype(np.float32)
    m = np.zeros((N, N), np.float32)
    for u in (EL, ER):
        ell(m, u, EYE_V, 0.13, 0.065)          # 眼 + 眼袋
        ell(m, u, EYE_V - 0.075, 0.15, 0.06)   # 眉
    ell(m, 0.5, (EYE_V + NOSE_V) / 2 + 0.02, 0.075, 0.17)  # 鼻梁 → 鼻翼
    ell(m, 0.5, NOSE_V + 0.005, 0.13, 0.05)                # 鼻翼两侧
    ell(m, 0.5, (NOSE_V + MOUTH_V) / 2 + 0.01, 0.07, 0.07)  # 人中
    ell(m, 0.5, MOUTH_V + 0.005, 0.18, 0.075)                        # 嘴
    for s in (-1, 1):  # 鼻唇沟
        ell(m, 0.5 + s * 0.15, (NOSE_V + MOUTH_V) / 2 + 0.02, 0.05, 0.11)
    # 用脸部可见皮肤拟合一个平滑的三次多项式明暗场（逐通道），作为「没有五官时」的皮肤底色
    big = cv2.dilate((m > 0).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    yy, xx = np.mgrid[0:N, 0:N]
    U, V = (xx + .5) / N, (yy + .5) / N
    lum = src.mean(2)
    face = (np.abs(U - .5) < .36) & (V > .22) & (V < .96) & ~big
    med = np.median(lum[face])
    face &= np.abs(lum - med) < 0.28 * med + 12  # 去掉发丝、背景、阴影离群点
    def basis(u, v):
        u, v = u - .5, v - .6
        return np.stack([u ** i * v ** j for i in range(4) for j in range(4 - i)], -1)
    A = basis(U[face], V[face])
    fill = np.zeros_like(src)
    Bm = basis(U, V)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, src[..., c][face], rcond=None)
        fill[..., c] = Bm @ coef
    # 遮罩边缘用原图做颜色校正（让过渡处色差为零）
    edge = cv2.dilate((m > 0).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~big
    grown = cv2.dilate((m > 0).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    w = cv2.GaussianBlur(grown, (0, 0), 3.0)
    w = np.clip(w * 1.4, 0, 1)[..., None]
    # 真实皮肤高通噪声：取左右脸颊块平铺
    hp = src - cv2.GaussianBlur(src, (0, 0), 3)
    patch = np.concatenate([hp[int(.47 * N):int(.47 * N) + 16, int(.1 * N):int(.1 * N) + 16],
                            hp[int(.47 * N):int(.47 * N) + 16, int(.74 * N):int(.74 * N) + 16]], 1)
    # 8×8 小块随机取样 + 随机翻转/旋转拼接，避免平铺花纹
    rs = np.random.default_rng(1000 + tier)
    reps = np.zeros_like(src)
    ph, pw = patch.shape[:2]
    for by in range(0, N, 8):
        for bx in range(0, N, 8):
            y0, x0 = rs.integers(0, ph - 8), rs.integers(0, pw - 8)
            blk = np.rot90(patch[y0:y0 + 8, x0:x0 + 8], rs.integers(0, 4))
            if rs.random() < .5: blk = blk[:, ::-1]
            reps[by:by + 8, bx:bx + 8] = blk
    # v76：脸缘之外（发际线发丝、两侧背景、耳朵、白色勾线）全部换成皮肤——
    # 多项式场在拟合区外按最近点取值（不外推），只在内脸椭圆里且像皮肤的像素保留原图
    Uc, Vc = np.clip(U, .16, .84), np.clip(V, .24, .95)
    full = np.zeros_like(src)
    Bc = basis(Uc, Vc)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, src[..., c][face], rcond=None)
        full[..., c] = Bc @ coef
    fill = np.where(m[..., None] > 0, fill, full)
    sat = src.max(2) - src.min(2)
    skinlike = ((lum > med * 0.62) & (lum < med * 1.16 + 8) & (sat > 0.35 * np.median(sat[face]))).astype(np.uint8)
    skinlike = cv2.erode(skinlike, np.ones((5, 5), np.uint8)).astype(np.float32)  # 白色勾线、发丝连边缘一起去掉
    inner = (((U - .5) / .40) ** 2 + ((V - .6) / .43) ** 2 < 1).astype(np.float32)
    keep = cv2.GaussianBlur(inner * skinlike, (0, 0), 2.5)
    w = np.maximum(w[..., 0], 1 - keep)[..., None]
    out = src * (1 - w) + (fill + reps * 0.75) * w
    # 极淡的结构：眼窝略暗、鼻梁一条若有若无的高光、下巴下缘略暗
    shade = np.ones((N, N), np.float32)
    for u in (EL, ER):
        shade -= 0.02 * soft(u, EYE_V + 0.005, 0.11, 0.06)
    shade += 0.03 * soft(0.5, (EYE_V + NOSE_V) / 2, 0.035, 0.16)
    out *= shade[..., None]
    os.makedirs(OUT, exist_ok=True)
    cv2.imwrite(os.path.join(OUT, f't{tier}.png'), np.clip(out, 0, 255).astype(np.uint8)[:, :, ::-1])


if __name__ == '__main__':
    for t in range(5):
        make(t)
    print('ok', OUT)
