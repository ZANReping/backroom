import sys;sys.path.insert(0,"/workspace/work/pylib")
import sys,os,json,re
from PIL import Image,ImageDraw,ImageFont
import numpy as np
R='/workspace/work/up/repo/app/reference/L1/'
F={'parking-common':'天鹰段-合集/最普遍的天鹰段.jpg','parking-round':'天鹰段-合集/圆柱天鹰段，天鹰段的墙壁.png','parking-room':'天鹰段-合集/天鹰段中的小房间.png','parking-water':'天鹰段-合集/天鹰段的水洼.png','parking-bright':'天鹰段-合集/较为光亮的天鹰段.png','parking-clean':'天鹰段-合集/较为干净的天鹰段.png','parking-dry':'天鹰段-合集/较为干燥的天鹰段.jpg','parking-dim':'天鹰段-合集/较为黑暗的天鹰段.png','parking-dark':'天鹰段-合集/黑暗的天鹰段.png','parking-props':'天鹰段自然生成的装饰物.avif','storage':'跃金段.jpg','gothic':'哥特段.png','ouroboros':'衔尾段.png','garden':'花园段.png','path-corridor':'小径走廊.jpg','path-room':'小径的房间之一.png','crate':'板条箱.png','power-out':'闪烁事件后的天鹰段.png','fabled':'传说段.webp'}
try:
  import pillow_avif
except: pass
def uniform_filter(x,k):
  p=k//2;xp=np.pad(x,p,mode='edge');c=xp.cumsum(0).cumsum(1);c=np.pad(c,((1,0),(1,0)))
  return (c[k:,k:]-c[:-k,k:]-c[k:,:-k]+c[:-k,:-k])/(k*k)
def ssim(A,B,data_range=255):
  C1=(.01*data_range)**2;C2=(.03*data_range)**2;f=lambda x:uniform_filter(x,7)
  ma,mb=f(A),f(B);va=f(A*A)-ma*ma;vb=f(B*B)-mb*mb;cv=f(A*B)-ma*mb
  return float((((2*ma*mb+C1)*(2*cv+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2))).mean())
def load_ref(id):
  p=R+F[id]
  try: return Image.open(p).convert('RGB')
  except Exception:
    os.system(f'ffmpeg -loglevel error -y -i "{p}" /tmp/_r.png'); return Image.open('/tmp/_r.png').convert('RGB')
def crop(shot,asp):
  w,h=shot.size
  if w/h>asp: nw=int(h*asp);x=(w-nw)//2;return shot.crop((x,0,x+nw,h))
  nh=int(w/asp);y=(h-nh)//2;return shot.crop((0,y,w,y+nh))
def metric(a,b):
  A=np.asarray(a.convert('L').resize((256,192)),float);B=np.asarray(b.convert('L').resize((256,192)),float)
  s=ssim(A,B,data_range=255)
  ha=np.histogram(A,32,(0,255))[0]/A.size;hb=np.histogram(B,32,(0,255))[0]/B.size
  ca=np.asarray(a.resize((64,48)),float).mean((0,1));cb=np.asarray(b.resize((64,48)),float).mean((0,1))
  # blurred-luma correlation (layout of light/dark masses)
  sa=np.asarray(a.convert('L').resize((32,24)),float);sb=np.asarray(b.convert('L').resize((32,24)),float)
  corr=np.corrcoef(sa.ravel(),sb.ravel())[0,1]
  return dict(ssim=round(s,3),hist=round(0.5*np.abs(ha-hb).sum(),3),lum=round(B.mean()-A.mean(),1),corr=round(corr,3),col=[round(x) for x in (cb-ca)])
if __name__=='__main__':
  d=sys.argv[1];ids=sys.argv[2:];out=[];rows=[];M={}
  for id in ids:
    nm,_,rid=id.partition('=');rid=rid or nm
    sp=f'{d}/ref-{nm}.png'
    if not os.path.exists(sp): continue
    r=load_ref(rid);asp=r.size[0]/r.size[1];s=crop(Image.open(sp).convert('RGB'),asp)
    H=300;r2=r.resize((int(H*asp),H));s2=s.resize((int(H*asp),H))
    m=metric(r2,s2);M[id]=m
    im=Image.new('RGB',(r2.size[0]*2+6,H+22),'white');im.paste(r2,(0,22));im.paste(s2,(r2.size[0]+6,22))
    ImageDraw.Draw(im).text((4,4),f"{id}  ssim {m['ssim']} hist {m['hist']} corr {m['corr']} dLum {m['lum']} dRGB {m['col']}",fill='black')
    rows.append(im)
  W=max(i.size[0] for i in rows);sheet=Image.new('RGB',(W,sum(i.size[1]+4 for i in rows)),'white');y=0
  for i in rows: sheet.paste(i,(0,y));y+=i.size[1]+4
  sheet.save(f'{d}/cmp.jpg',quality=85);json.dump(M,open(f'{d}/metrics.json','w'),indent=1)
  for k,v in M.items(): print(k,v)
