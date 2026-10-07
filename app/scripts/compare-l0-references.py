"""Create reproducible comparison/50% overlay sheets from saved real game captures."""
from pathlib import Path
import argparse
import re
from PIL import Image, ImageDraw

app = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Compare saved Level 0 reference captures.')
parser.add_argument('tag', nargs='?', help='optional lowercase output tag, e.g. iteration-4')
args = parser.parse_args()
if args.tag is not None and not re.fullmatch(r'[a-z0-9-]+', args.tag):
    parser.error('tag must match /^[a-z0-9-]+$/')
out = app / 'reports/l0-remake' / args.tag if args.tag else app / 'reports/l0-remake'
pairs = [
 ('yellow','黄室.jpg'), ('arch','拱门.jpg'), ('pillars','柱厅.jpg'),
 ('pits','深坑.webp'), ('blackout','熄灯区.jpg'), ('red','红室.webp'),
 ('red-lost','红室，玩家迷失前.png'), ('manila-inside','马尼拉房间内部.avif'),
 ('manila-door','马尼拉房间，从门向内.avif'), ('manila-outside','马尼拉房间附近.avif'),
 ('manila-wall','马尼拉房间墙纸.avif'), ('manila-plan','马尼拉房间布局.avif'),
]
sheet = Image.new('RGB',(1280,6*264),'#171916')
draw = ImageDraw.Draw(sheet)
for i,(name,file) in enumerate(pairs):
    reference = Image.open(app/'reference'/file).convert('RGB')
    actual = Image.open(out/f'after-{name}-reference.png').convert('RGB')
    ref = reference.resize(actual.size,Image.Resampling.LANCZOS)
    Image.blend(ref,actual,.5).save(out/f'overlay-{name}.png')
    pair = Image.new('RGB',(actual.width*2,actual.height+24),'#171916')
    pair.paste(ref,(0,24));pair.paste(actual,(actual.width,24))
    pd = ImageDraw.Draw(pair);pd.text((8,6),'Reference: '+name,fill='white');pd.text((actual.width+8,6),'In game',fill='white')
    pair.save(out/f'compare-{name}.jpg',quality=92)
    col=(i%2)*640;row=(i//2)*264
    draw.text((col+8,row+6),name+' / reference + in game',fill='white')
    for x,image in [(col,ref),(col+320,actual)]:
        thumb=image.copy();thumb.thumbnail((320,240),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(x+(320-thumb.width)//2,row+24+(240-thumb.height)//2))
sheet.save(out/'reference-contact.jpg',quality=93)
print('Saved 12 comparison sheets, 12 overlays and contact sheet.')

details = ['cabinet', 'chair', 'door', 'lamp', 'vent', 'outlet']
if all((out/f'after-detail-{name}.png').exists() for name in details):
    detail_sheet = Image.new('RGB', (1440, 2*384), '#171916')
    labels = ImageDraw.Draw(detail_sheet)
    for i, name in enumerate(details):
        x, y = i % 3 * 480, i // 3 * 384
        labels.text((x+8, y+6), name + ' / production scene', fill='white')
        shot = Image.open(out/f'after-detail-{name}.png').convert('RGB')
        detail_sheet.paste(shot.resize((480, 360), Image.Resampling.LANCZOS), (x, y+24))
    detail_sheet.save(out/'detail-contact.jpg', quality=94)

focus_states = ['clear', 'low-sanity', 'red-transition', 'combined']
if all((out/f'after-focus-{mode}-{state}.png').exists() for mode in ['realistic', 'classic'] for state in focus_states):
    focus_sheet = Image.new('RGB', (1320, 608), '#171916')
    labels = ImageDraw.Draw(focus_sheet)
    for row, mode in enumerate(['realistic', 'classic']):
        for col, state in enumerate(focus_states):
            x, y = col*330, row*304
            labels.text((x+6,y+6), mode+' / '+state, fill='white')
            shot = Image.open(out/f'after-focus-{mode}-{state}.png').convert('RGB')
            focus_sheet.paste(shot.resize((330,280),Image.Resampling.LANCZOS),(x,y+24))
    focus_sheet.save(out/'focus-contact.jpg',quality=95)

normal_files = ['7391-16-16', '7391-29-27', '7391-33-27', '7391-64-46', '781--32--16', '42561-48-31']
if all((out/f'after-normal-{name}.png').exists() for name in normal_files):
    normal_sheet = Image.new('RGB', (1440, 2*294), '#171916')
    labels = ImageDraw.Draw(normal_sheet)
    for i, name in enumerate(normal_files):
        x, y = i % 3 * 480, i // 3 * 294
        labels.text((x+8,y+6), 'Normal seed / world position: '+name, fill='white')
        shot = Image.open(out/f'after-normal-{name}.png').convert('RGB')
        normal_sheet.paste(shot.resize((480,270),Image.Resampling.LANCZOS),(x,y+24))
    normal_sheet.save(out/'normal-contact.jpg',quality=94)

previous = out/'iteration-13-before'
if (previous/'after-yellow-reference.png').exists():
    comparison = Image.new('RGB', (1280, 2*504), '#171916')
    labels = ImageDraw.Draw(comparison)
    for row, name in enumerate(['yellow','manila-inside']):
        for col, path in enumerate([previous,out]):
            labels.text((col*640+8,row*504+6), name+' / '+('Before feedback' if col==0 else 'Current'),fill='white')
            shot = Image.open(path/f'after-{name}-reference.png').convert('RGB')
            comparison.paste(shot.resize((640,480),Image.Resampling.LANCZOS),(col*640,row*504+24))
    comparison.save(out/'natural-light-comparison.jpg',quality=94)
