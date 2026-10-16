# 通用无面灵脸面（v75）
public/textures/npc-retro/faceless/t0..t4.png：5 档肤色（skinTier 0 最浅 → 4 最深）的无五官写实脸面，128²。
来源：同档池内脸照 pool/f{tier}-0/neutral.png（本仓库生成的写实照片，提示词见 ../manifest.json → pool），
由 scripts/gen-faceless-textures.py 挖掉眉眼鼻口、用脸部皮肤拟合三次多项式明暗场回填、平铺脸颊真实毛孔噪声；保留 2% 眼窝暗影。
构图与 POOL_META 一致（landmarks [0.368,0.597,0.775,0.975,0.295,0.705]，skinUV [0.2,0.47]）。
