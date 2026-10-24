"""Process original shop albedos. The import archive contains finished maps, not AI source PNGs."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter,ImageDraw

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('prefix',nargs='*',help='Optional AI surface prefixes, e.g. hw or gn_wall')
parser.add_argument('--source-dir',type=Path,default=Path(__file__).resolve().parents[1]/'.cache/traders-shop-sources',help='Directory containing shop_<surface>.png source images')
parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parents[1]/'public/textures/traders/shops')
parser.add_argument('--contact-sheet',type=Path,help='Optional contact sheet path (full generation only)')
args=parser.parse_args()
T=str(args.output_dir.resolve())+'/'
def seamless(a,ax='xy'):
  h,w=a.shape[:2];s=np.roll(np.roll(a,h//2 if 'y' in ax else 0,0),w//2 if 'x' in ax else 0,1)
  y=np.abs(np.linspace(-1,1,h))[:,None]*('y' in ax);x=np.abs(np.linspace(-1,1,w))[None,:]*('x' in ax)
  m=np.clip((np.maximum(x,y)-.6)/.3,0,1);m=m*m*(3-2*m)
  if a.ndim==3:m=m[...,None]
  return a*(1-m)+s*m
def flatten(a,r=96):
  img=Image.fromarray(np.clip(a,0,255).astype(np.uint8));lo=np.asarray(img.filter(ImageFilter.GaussianBlur(r))).astype(float)
  return a-lo+lo.mean(axis=(0,1))
def normal(h,s):
  gx=(np.roll(h,-1,1)-np.roll(h,1,1))*s;gy=(np.roll(h,-1,0)-np.roll(h,1,0))*s
  n=np.dstack([-gx,gy,np.ones_like(h)]);n/=np.linalg.norm(n,axis=2,keepdims=True);return ((n*.5+.5)*255).astype(np.uint8)
def save(name,a,size,hstr,rb,ra,blend=True,flat=96):
  if flat:a=flatten(a,flat)
  if blend:a=seamless(a,blend if isinstance(blend,str) else 'xy')
  im=Image.fromarray(np.clip(a,0,255).astype(np.uint8)).resize((size,size),Image.LANCZOS);im.save(T+name+'_color.jpg',quality=88)
  a=np.asarray(im).astype(float);h=a.mean(axis=2)/255.;hb=np.asarray(Image.fromarray((h*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(float)/255
  s=min(size,512);Image.fromarray(normal(hb,hstr)).resize((s,s),Image.LANCZOS).save(T+name+'_normalgl.jpg',quality=88)
  r=np.clip(rb+(hb.mean()-hb)*ra,0,1);Image.fromarray((r*255).astype(np.uint8)).resize((s,s),Image.LANCZOS).save(T+name+'_roughness.jpg',quality=88)
def src(n):return np.asarray(Image.open(args.source_dir/('shop_'+n+'.png')).convert('RGB').resize((1024,1024),Image.LANCZOS)).astype(float)
cfg={'hw_floor':(1024,4,.62,.5,True,120),'hw_wall':(1024,5,.8,.3,True,160),'hw_ceiling':(512,7,.55,.5,False,0),
'ww_floor':(1024,7,.45,.6,True,90),'ww_wall':(1024,6,.5,.4,'y',160),'ww_ceiling':(512,5,.7,.3,False,0),
'of_wall':(1024,2,.85,.2,True,120),'of_ceiling':(512,4,.92,.4,False,0),
'od_floor':(1024,6,.75,.5,True,120),'gn_floor':(1024,4,.42,.5,True,120),'gn_wall':(1024,3,.7,.3,True,160),'gn_ceiling':(512,5,.6,.4,False,0),'od_wall':(1024,6,.6,.4,'x',0),'od_ceiling':(512,4,.65,.4,False,0),'cd_floor':(1024,2,.3,.3,True,0)}
ONLY=args.prefix
required=[k for k in cfg if not ONLY or any(k.startswith(o) for o in ONLY)]
if not ONLY:required.append('of_floor')
missing=[str(args.source_dir/('shop_'+k+'.png')) for k in required if not (args.source_dir/('shop_'+k+'.png')).is_file()]
if missing:parser.error('Missing original source images (finished archive maps remain usable): '+', '.join(missing))
args.output_dir.mkdir(parents=True,exist_ok=True)
for k,(sz,hs,rb,ra,bl,fl) in cfg.items():
  if ONLY and not any(k.startswith(o) for o in ONLY):continue
  save(k,src(k),sz,hs,rb,ra,bl,fl)
if ONLY:raise SystemExit(0)
# checker: exact 8x8 squares + AI surface detail
a=src('of_floor');det=a.mean(2)-np.asarray(Image.fromarray(a.mean(2).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(float)
yy,xx=np.mgrid[0:1024,0:1024];ch=((yy//128+xx//128)%2==0)
base=np.where(ch[...,None],np.array([236,228,206]),np.array([26,26,28])).astype(float)
grout=((yy%128)<3)|((xx%128)<3);base[grout]=[120,116,104]
base+=seamless(det[...,None]*np.ones(3))*.8
save('of_floor',base,1024,2,.3,.3,False,0)
# procedural candy wallpaper (pink/white stripes + red pinstripes) and mint polka ceiling
rng=np.random.default_rng(7);N=1024
x=np.arange(N);band=(x//(N//16))%2==0
img=np.zeros((N,N,3));pink=np.array([244,170,196]);white=np.array([250,244,240]);red=np.array([206,52,74])
img[:]=np.where(band[None,:,None],pink,white)
edge=(x%(N//16)<5)|(x%(N//16)>N//16-6);img[:,edge&band]=red
img+=rng.normal(0,4,(N,N,1));img=np.asarray(Image.fromarray(np.clip(img,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))).astype(float)
save('cd_wall',img,1024,2,.8,.2,False,0)
im=Image.new('RGB',(512,512),(176,226,206));d=ImageDraw.Draw(im)
for r in range(4):
  for c in range(4):
    cx=c*128+(64 if r%2 else 0)+32;cy=r*128+64
    for ox in (-512,0,512):d.ellipse((cx+ox-20,cy-20,cx+ox+20,cy+20),fill=(252,250,244))
a=np.asarray(im).astype(float)+rng.normal(0,3,(512,512,1));save('cd_ceiling',a,512,2,.85,.2,False,0)
# contact sheet: each texture tiled 2x2

sh=Image.new('RGB',(5*260,3*280),'#555');dr=ImageDraw.Draw(sh)
order=['hw','ww','cd','of','od'];surf=['floor','wall','ceiling']
for i,s in enumerate(order):
  for j,f in enumerate(surf):
    im=Image.open(T+s+'_'+f+'_color.jpg');t=Image.new('RGB',(512,512))
    for k in range(4):t.paste(im.resize((256,256)),((k%2)*256,(k//2)*256))
    sh.paste(t.resize((250,250)),(i*260+5,j*280+25));dr.text((i*260+8,j*280+6),s+'_'+f,fill='white')
if args.contact_sheet:
  args.contact_sheet.parent.mkdir(parents=True,exist_ok=True)
  sh.save(args.contact_sheet,quality=85)
print('ok')
