# [l5tails] 拼 reports/l5tails/tails.jpg（素材来自 l5tails-dump.ts 与 skirt.gif）
import glob,os
from PIL import Image, ImageDraw, ImageFont
fp=[f for f in glob.glob(os.path.expanduser('~/.fonts/*')) if f.lower().endswith(('ttf','otf','ttc'))][0]
F=lambda s: ImageFont.truetype(fp,s)
P='reports/l5tails/parts/'
CW,CH=520,430
def fit(im,w,h):
    im=im.copy(); im.thumbnail((w,h)); return im
def cell(title,sub,img=None,lines=None):
    c=Image.new('RGB',(CW,CH),(24,20,18)); d=ImageDraw.Draw(c)
    d.rectangle((0,0,CW,54),fill=(0,0,0)); d.text((10,4),title,fill=(255,226,160),font=F(20)); d.text((10,30),sub,fill=(200,200,200),font=F(14))
    if img is not None:
        im=fit(img,CW-10,CH-62); c.paste(im,((CW-im.width)//2,58+(CH-62-im.height)//2))
    if lines:
        y=70
        for l in lines: d.text((16,y),l,fill=(225,225,225),font=F(17)); y+=28
    return c
g=Image.open('reports/l5tails/skirt.gif'); g.seek(55); sk=g.convert('RGB'); g.seek(150); sk2=g.convert('RGB')
both=Image.new('RGB',(sk.width*2,sk.height)); both.paste(sk,(0,0)); both.paste(sk2,(sk.width,0))
por=Image.open(P+'portraits.png'); wf=Image.open(P+'wallface.png')
fl=[Image.open(P+f) for f in ['f1.png','f7.png','f9.png','f10.png']]
grid=Image.new('RGB',(fl[0].width*2+6,fl[0].height*2+6),(0,0,0))
for i,f in enumerate(fl): grid.paste(f,((i%2)*(f.width+6),(i//2)*(f.height+6)))
dg=ImageDraw.Draw(grid)
for i,t in enumerate(['1F','7F 藏书层','9F 飞蛾层','10F 行李层']): dg.text(((i%2)*(fl[0].width+6)+6,(i//2)*(fl[0].height+6)+4),t,fill=(255,255,255),font=F(22))
b1=Image.open(P+'b1.png'); pud=b1.crop((0,80*4,80*4,160*4)).resize((480,480),Image.NEAREST)
OK='（通过）'
cells=[
 cell('一 迎宾女郎裙摆穿腿','腿胶囊顶点推出 · check:spokes-anim 84/84 · 最大穿透 0.00 mm',both),
 cell('二.1 低理智肖像换章鱼头','上 / 左下：9 张面孔；右下 3 张：章鱼头（理智<40、视线外）',por),
 cell('二.2 墙纸人脸','理智<40 余光 1.6–4 m 浮现，被注视 0.25 s 内消失',wf),
 cell('二.3 走廊肖像 / 各层陈设','红=走廊肖像 绿=7F 书架 蓝=10F 行李堆 黄=走廊灯（9F ×0.48）',grid),
 cell('二.4 管道下水洼','B1 俯视局部：青点=水洼（紧挨管段）；喝一次理智 +5',pud),
 cell('二.5 邀请函 → 原住民','check:l5tails 实测',None,['没读邀请函：贝弗莉门照旧传送同楼层'+OK,'读烫金邀请函：记住（hotel.tails.invite，进存档）'+OK,'之后能推开的墙门 / 活板门 → 原住民据点','  （transition.dest = 112）'+OK,'门后文字：「门后不是走廊，是一间点着煤气灯的客厅。」']),
 cell('二.6 B1 专属黑门','B1 俯视：品红=黑门（→L6，本图 5 扇）；其他楼层 0 扇',b1),
 cell('二.7 大堂门只在不被注视时出现','4f478d3 已实现；本轮补验收',None,['盯着那面墙 5 s：门不出现'+OK,'转身 2 s（不被注视满 1.5 s）：门出现'+OK,'出现后本楼层地图内一直在','渲染层每帧按 hotelLobbyShown 切 visible']),
 cell('二.8 灯光闪烁连灯罩一起压暗','4f478d3 已实现；本轮补验收',None,['闪烁方波 0.08 / 1'+OK,'点光强度与灯具自发光（灯罩 f.mat.color）','  共用 flickerMul(engine, src.x, src.y)'+OK,'（L5-HOTEL.md「未做」里这条是文档没更新）']),
]
sheet=Image.new('RGB',(CW*3+8,CH*3+8),(60,50,40))
for i,c in enumerate(cells): sheet.paste(c,((i%3)*(CW+4),(i//3)*(CH+4)))
sheet.save('reports/l5tails/tails.jpg',quality=86)
print(sheet.size)
