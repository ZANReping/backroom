"""Generate the deterministic Traders' Home dressing atlas (Pillow only)."""
from pathlib import Path
import hashlib, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'textures'/'traders'; OUT.mkdir(parents=True,exist_ok=True)
SEED=20261021; random.seed(SEED)
font_paths=['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/Arial.ttf']
FONT=next((p for p in font_paths if Path(p).exists()),None)
def font(n): return ImageFont.truetype(FONT,n) if FONT else ImageFont.load_default()
names=['NOTICE','FIRE SAFETY','TRADERS KEEP','S-014 CARGO','DUTY BOARD','TERMINAL','KEYPAD','ARCHIVE','FIRST AID','HANDWASH','CLOCK','BARCODE','BEDDING','VENT PANEL','STAFF ONLY','WORK ORDER']
bg=[(211,201,173),(198,190,164),(190,187,162),(211,202,177),(199,193,171),(64,71,69),(173,177,162),(108,103,91),(137,164,133),(202,198,169),(191,183,154),(221,213,185),(205,198,176),(125,132,130),(177,185,167),(211,203,176)]
atlas=Image.new('RGB',(1024,1024),(180,175,153)); d=ImageDraw.Draw(atlas)
def linebox(x0,y0,x1,y1,fill=(62,67,61),w=2): d.rectangle((x0,y0,x1,y1),outline=fill,width=w)
def text(x,y,s,n=18,fill=(48,54,49),anchor=None): d.text((x,y),s,font=font(n),fill=fill,anchor=anchor)
for i in range(16):
 x=(i%4)*256; y=(i//4)*256; d.rectangle((x,y,x+255,y+255),fill=bg[i]); 
 if i!=13: d.rectangle((x+8,y+8,x+247,y+247),outline=(110,105,88),width=2)
 if i not in [6,10,12,13]: text(x+18,y+18,names[i],16,(55,61,55))
 if i==0:
  for j in range(4): linebox(x+28,y+62+j*34,x+220,y+78+j*34); text(x+35,y+64+j*34,['PUBLIC NOTICE','KEEP ROUTE CLEAR','REPORT DAMAGE','CHECK IN'][j],10)
 elif i==1:
  d.polygon([(x+58,y+105),(x+83,y+58),(x+108,y+105)],fill=(190,100,63)); text(x+83,y+84,'!',30,(245,235,196),'mm'); text(x+125,y+69,'EXIT',17); text(x+125,y+99,'NO SMOKING',12); linebox(x+36,y+145,x+215,y+194)
 elif i==2:
  linebox(x+25,y+55,x+230,y+218); d.rectangle((x+70,y+88,x+188,y+174),fill=(147,144,126),outline=(56,65,58),width=2); text(x+129,y+130,'VAULT',12,(45,53,48),'mm')
  for xx,yy in [(x+30,y+135),(x+225,y+135),(x+128,y+60)]: d.ellipse((xx-7,yy-7,xx+7,yy+7),fill=(157,71,55)); text(xx,yy-20,'EXIT',9,(66,58,48),'mm')
  d.line((x+40,y+72,x+215,y+72),fill=(84,94,79),width=5); d.line((x+40,y+205,x+215,y+205),fill=(84,94,79),width=5)
 elif i==3:
  linebox(x+25,y+54,x+231,y+215); text(x+35,y+66,'MANIFEST S-014',13); [d.line((x+30,y+90+j*22,x+226,y+90+j*22),fill=(100,98,82),width=1) for j in range(6)]; [d.line((x+92+j*43,y+88,x+92+j*43,y+210),fill=(100,98,82),width=1) for j in range(3)]
 elif i==4:
  linebox(x+24,y+55,x+232,y+214); text(x+35,y+67,'SHIFT / ROUTE',12); d.line((x+40,y+180,x+210,y+95),fill=(84,112,91),width=3); [d.ellipse((xx-3,yy-3,xx+3,yy+3),fill=(84,112,91)) for xx,yy in [(x+40,y+180),(x+90,y+152),(x+140,y+128),(x+210,y+95)]]
 elif i==5:
  d.rectangle((x+28,y+55,x+228,y+210),fill=(35,42,41),outline=(117,133,118),width=3); [text(x+44,y+76+j*24,['READY','LOGS','ROUTE','STATUS','CLOSE'][j],12,(154,190,153)) for j in range(5)]
 elif i==6:
  for row in range(4):
   for col in range(3):
    bx=x+35+col*64; by=y+32+row*49; d.rounded_rectangle((bx,by,bx+54,by+40),4,fill=(209,211,195),outline=(69,77,70),width=3); text(bx+27,by+21,'123456789*0#'[row*3+col],24,(45,54,48),'mm')
 elif i==7:
  d.rounded_rectangle((x+70,y+60,x+187,y+210),8,fill=(104,93,80),outline=(56,57,51),width=3); d.rectangle((x+82,y+75,x+176,y+202),fill=(202,194,165)); text(x+129,y+140,'ARCHIVE\n07',15,(56,61,54),'mm')
 elif i==8:
  d.ellipse((x+70,y+70,x+185,y+185),fill=(225,225,201),outline=(70,102,78),width=3); d.rectangle((x+118,y+88,x+137,y+168),fill=(72,137,88)); d.rectangle((x+92,y+114,x+163,y+137),fill=(72,137,88))
 elif i==9:
  # Simple equipment instructions, not ambiguous stick-figure pictograms.
  for j,caption in enumerate(['SOAP','RINSE','DRY']):
   cx=x+50+j*78; d.ellipse((cx-24,y+82,cx+24,y+130),outline=(74,91,79),width=2); text(cx,y+106,str(j+1),25,(58,76,65),'mm'); text(cx,y+164,caption,11,(48,64,57),'mm')
  d.line((x+48,y+198,x+209,y+198),fill=(110,125,107),width=2); text(x+128,y+216,'20 SECONDS',11,(65,84,70),'mm')
 elif i==10:
  d.ellipse((x+16,y+16,x+240,y+240),outline=(55,61,53),width=4); [text(x+128+int(88*__import__('math').sin(k*__import__('math').pi/6)),y+128-int(88*__import__('math').cos(k*__import__('math').pi/6)),str(k or 12),11,(55,61,53),'mm') for k in range(12)]
 elif i==11:
  linebox(x+30,y+65,x+225,y+190); text(x+43,y+76,'TV-014 / S-014',13); [d.line((x+45+j*7,y+120,x+45+j*7,y+168),fill=(40,45,42),width=3 if j%3 else 1) for j in range(20)]
 elif i==12:
  for j in range(14): d.line((x+18,y+18+j*16,x+238,y+18+j*16),fill=(166,156,139),width=2); [d.line((x+18+j*16,y+18,x+28+j*16,y+238),fill=(216,207,184),width=2) for j in range(14)]
 elif i==13:
  # Periodic tile: 8 holes per axis. Geometry repeats it at physical scale.
  d.rectangle((x,y,x+255,y+255),fill=(116,123,121))
  for col in range(8):
   for row in range(8):
    cx=x+23+col*30; cy=y+23+row*30; d.ellipse((cx-2.5,cy-2.5,cx+2.5,cy+2.5),fill=(36,43,42))
 elif i==14:
  d.rectangle((x+42,y+78,x+212,y+170),fill=(75,106,80)); text(x+127,y+123,'STAFF\nONLY',22,(218,211,177),'mm')
 else:
  linebox(x+34,y+65,x+222,y+198); [text(x+52,y+83+j*25,'☑  '+s,12,(53,61,52)) for j,s in enumerate(['CHECK SEAL','COUNT ITEMS','SIGN OFF','FILE COPY'])]
# Ensure atlas edges are valid for sampling: extend each cell edge inward by 8px.
for i in range(16):
 x=(i%4)*256; y=(i//4)*256; cell=atlas.crop((x,y,x+256,y+256));
 atlas.paste(cell.crop((8,0,9,256)).resize((8,256)),(x,y)); atlas.paste(cell.crop((247,0,248,256)).resize((8,256)),(x+248,y)); atlas.paste(cell.crop((0,8,256,9)).resize((256,8)),(x,y)); atlas.paste(cell.crop((0,247,256,248)).resize((256,8)),(x,y+248))
atlas.save(OUT/'dressing_color.jpg',quality=95,subsampling=0)
small=atlas.resize((512,512),Image.Resampling.LANCZOS).convert('L')
normal=Image.new('RGB',(512,512),(128,128,255)); rough=Image.new('L',(512,512),190); nd=ImageDraw.Draw(normal); rd=ImageDraw.Draw(rough)
for i in range(16):
 x=(i%4)*128; y=(i//4)*128; crop=small.crop((x,y,x+128,y+128)).filter(ImageFilter.GaussianBlur(.7)); normal.paste(Image.merge('RGB',(crop.point(lambda p:128),crop.point(lambda p:128),Image.new('L',(128,128),255))),(x,y)); rd.rectangle((x,y,x+127,y+127),fill=200 if i in [5,13] else 190 if i in [7,12] else 178)
normal.save(OUT/'dressing_normalgl.jpg',quality=95,subsampling=0); rough.save(OUT/'dressing_roughness.jpg',quality=95)
print('generated',[(p.name,hashlib.sha256(p.read_bytes()).hexdigest()) for p in [OUT/'dressing_color.jpg',OUT/'dressing_normalgl.jpg',OUT/'dressing_roughness.jpg']])
