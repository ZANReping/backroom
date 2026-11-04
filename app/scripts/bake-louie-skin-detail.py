# Louie 皮肤照片细节：取 retroNpc 照片脸 kat-face.webp（项目自有 AI 生成，见 npc-retro/NAMED-FACES-SOURCES.md）的高通亮度（毛孔 / 细纹 / 色斑），
# 按五官定位（眼线 / 鼻底 / 嘴线 / 下巴）重映射到 Louie 头部 UV（U = 0.5 + θ/2π，s = sin θ；V：t = −0.06 + 1.06V），只输出正面半圈 U∈[0.25,0.75]。
# 眼、唇、发际、两侧外缘置中性 128（运行时程序贴图负责）。输出 public/textures/casino/louie-skin-detail.webp（1024×2048，L 通道）。
import sys, math, numpy as np
from PIL import Image, ImageFilter
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/work/arms-wt/app/art-source/npc-retro/kat-face.webp'
im = Image.open(src).convert('L'); W0, H0 = im.size
a = np.asarray(im, np.float32)
hp = a - np.asarray(im.filter(ImageFilter.GaussianBlur(5)), np.float32)
hp2 = a - np.asarray(im.filter(ImageFilter.GaussianBlur(14)), np.float32)
det = np.clip(hp * 1.0 + (hp2 - hp) * 0.35, -40, 40)
T = [0.04, 0.208, 0.33, 0.555]; Y = [0.97, 0.78, 0.6, 0.36]
def ymap(t):
    if t >= T[-1]: return Y[-1] + (t - T[-1]) * (Y[-1] - Y[-2]) / (T[-1] - T[-2])
    if t <= T[0]: return Y[0] + (t - T[0]) * (Y[1] - Y[0]) / (T[1] - T[0])
    return float(np.interp(t, T, Y))
OW, OH = 1024, 2048
U = 0.25 + (np.arange(OW) + 0.5) / OW * 0.5; V = 1 - (np.arange(OH) + 0.5) / OH  # 行 0 = V 顶
th = (U - 0.5) * 2 * math.pi; s = np.sin(th)
t = -0.06 + 1.06 * V
yv = np.array([ymap(x) for x in t])
X = (0.5 + s[None, :] * 0.477) * W0; Yp = yv[:, None] * H0
Xi = np.clip(np.broadcast_to(X, (OH, OW)), 0, W0 - 1.001); Yi = np.clip(np.broadcast_to(Yp, (OH, OW)), 0, H0 - 1.001)
x0 = Xi.astype(int); y0 = Yi.astype(int); fx = Xi - x0; fy = Yi - y0
d = det[y0, x0] * (1 - fx) * (1 - fy) + det[y0, x0 + 1] * fx * (1 - fy) + det[y0 + 1, x0] * (1 - fx) * fy + det[y0 + 1, x0 + 1] * fx * fy
S = np.broadcast_to(s[None, :], (OH, OW)); TT = np.broadcast_to(t[:, None], (OH, OW)); AS = np.abs(S)
sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
m = np.ones_like(d)
m *= sm(0.75, 1.2, np.hypot((AS - 0.44) / 0.24, (TT - 0.555) / 0.06))           # 眼
m *= sm(0.8, 1.25, np.hypot(S / 0.38, (TT - 0.21) / 0.045))                       # 唇
m *= sm(0.93, 0.8, AS) * sm(0.86, 0.78, TT) * sm(-0.01, 0.06, TT)                 # 外缘 / 发际 / 颌下
lim = 0.9 - 0.28 * sm(0.32, 0.04, TT); m *= sm(lim, lim - 0.12, AS)                  # 下颌两侧照片轮廓线
m *= (np.abs(th) < math.pi / 2)
out = np.clip(128 + d * m * 2.2, 0, 255).astype(np.uint8)
Image.fromarray(out, 'L').save('public/textures/casino/louie-skin-detail.webp', quality=88, method=6)
print('ok', out.shape, float(out.std()))
