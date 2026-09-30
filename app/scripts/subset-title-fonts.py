"""Rebuild small title fonts from bundled OFL fonts: python scripts/subset-title-fonts.py.

Build-time only: requires fonttools and brotli (or .cache/title-font-tools).
New level names/labels should rerun this script; missing glyphs still fall back.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/title-font-tools'))
from fontTools import subset
from fontTools.ttLib import TTFont

text = 'LEVEL Level 0123456789 ·「」“” - .ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
for path in sorted((ROOT / 'src/game/levels').glob('*.ts')):
    text += ''.join(re.findall(r"^\s*(?:name|label):\s*'([^']*)'", path.read_text(encoding='utf-8'), re.M))

dest = ROOT / 'src/assets'
dest.mkdir(exist_ok=True)
for source, output, family, weight in [
    ('glow-sans-sc-ext-700.woff2', 'title-wide.woff2', 'Backroom Title Wide', 700),
    ('zhimangxing.ttf', 'title-hand.woff2', 'Backroom Title Hand', 400),
]:
    font = TTFont(ROOT / 'public/fonts' / source, recalcTimestamp=False)
    options = subset.Options()
    options.name_IDs = ['*']  # Preserve original copyright, license and designer.
    options.name_languages = ['*']
    options.layout_features = ['*']
    job = subset.Subsetter(options=options)
    job.populate(text=text)
    job.subset(font)
    # Avoid using upstream family/reserved names for modified subsets.
    style = 'Bold' if weight == 700 else 'Regular'
    ps_name = family.replace(' ', '') + '-' + style
    for record in font['name'].names:
        value = {1: family, 2: style, 3: ps_name, 4: family + ' ' + style,
                 6: ps_name, 16: family, 17: style}.get(record.nameID)
        if value:
            record.string = value.encode(record.getEncoding())
    font.flavor = 'woff2'
    font.save(dest / output)
    print(f'{output}: {(dest / output).stat().st_size:,} bytes, {len(font.getBestCmap())} codepoints')
