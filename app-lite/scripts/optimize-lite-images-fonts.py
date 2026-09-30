"""Rebuild lite images/fonts from the read-only sibling app. Requires Pillow, fonttools and Node.js."""
from pathlib import Path
import concurrent.futures
import io
import json
import sys
import subprocess
import types

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/python'))
from PIL import Image
# Node's built-in Brotli avoids an extra native Python dependency on Windows.
try:
    import brotli
except ImportError:
    brotli = types.ModuleType('brotli')
    brotli.MODE_FONT, brotli.MODE_TEXT = 2, 1
    def codec(data, mode=None):
        js = "const z=require('node:zlib'),f=require('node:fs');const d=f.readFileSync(0);process.stdout.write(" + (
            "z.brotliDecompressSync(d)" if mode is None else
            f"z.brotliCompressSync(d,{{params:{{[z.constants.BROTLI_PARAM_MODE]:{mode}}}}})") + ");"
        return subprocess.run(['node', '-e', js], input=data, capture_output=True, check=True).stdout
    brotli.decompress = lambda data: codec(data)
    brotli.compress = lambda data, mode=0: codec(data, mode)
    sys.modules['brotli'] = brotli
from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE = ROOT.parent / 'app'

def image_job(src):
    rel = src.relative_to(SOURCE / 'public')
    dest = ROOT / 'public' / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        original_size = im.size
        alpha = 'A' in im.getbands() or 'transparency' in im.info
        # Preserve UI icons; allow more resolution for signs, text and UV labels.
        limit = 1024 if any(s in src.stem.lower() for s in ('poster', 'menu', 'notice', 'label', 'sign', 'faction', 'logo')) else 512
        im = im.convert('RGBA' if alpha else 'RGB')
        im.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        data = io.BytesIO()
        if src.suffix.lower() == '.png':
            # Palette PNG preserves real PNG filenames and transparency without a loader change.
            # Keep tiny/pixel-art images exact; larger illustrations use 256 colors.
            if max(im.size) > 256:
                im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE if alpha else Image.Quantize.MEDIANCUT)
            im.save(data, format='PNG', optimize=True)
        else:
            normal_map = 'normal' in src.stem.lower()
            im.save(data, format='JPEG', quality=80 if normal_map else 75, subsampling=0 if normal_map else 2, optimize=True)
        encoded = data.getvalue()
        if len(encoded) >= src.stat().st_size:
            encoded = src.read_bytes()
        dest.write_bytes(encoded)
    with Image.open(dest) as check:
        check.load()
        assert not alpha or 'A' in check.getbands() or 'transparency' in check.info, str(rel)
        size = check.size
    return dict(path=rel.as_posix(), before=src.stat().st_size, after=len(encoded), originalDimensions=original_size, dimensions=size, alpha=alpha)

def main():
    images = sorted(p for p in (SOURCE / 'public').rglob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(image_job, images))
    print('Images:', sum(r['before'] for r in results), '->', sum(r['after'] for r in results), flush=True)
    # Include every source character (including escaped Unicode), ASCII and punctuation.
    # Characters from arbitrary player names can still use the existing CSS fallback fonts.
    chars = set(chr(i) for i in range(32, 256)) | set(chr(i) for i in range(0x2000, 0x2070))
    import re
    for path in [ROOT / 'index.html', *(ROOT / 'src').rglob('*')]:
        if path.is_file() and path.suffix in ('.ts', '.tsx', '.css', '.html', '.json'):
            text = path.read_text(encoding='utf-8')
            chars.update(text)
            chars.update(chr(int(m, 16)) for m in re.findall(r'\\u([0-9a-fA-F]{4})', text))
    fonts = []
    for src in sorted((SOURCE / 'public/fonts').iterdir()):
        if src.suffix not in ('.woff2', '.ttf'):
            continue
        font = TTFont(src)
        expected = set(font.getBestCmap()) & {ord(c) for c in chars}
        opts = subset.Options()
        opts.name_IDs = ['*']
        opts.name_legacy = True
        opts.name_languages = ['*']
        sub = subset.Subsetter(options=opts)
        sub.populate(unicodes=expected)
        sub.subset(font)
        dest = ROOT / 'public/fonts' / src.name
        font.save(dest)
        if dest.stat().st_size > src.stat().st_size:
            dest.write_bytes(src.read_bytes())
        check = TTFont(dest)
        assert expected <= set(check.getBestCmap()), src.name
        fonts.append(dict(path='fonts/' + src.name, before=src.stat().st_size, after=dest.stat().st_size, retainedCodepoints=len(expected)))
        print(src.name, src.stat().st_size, '->', dest.stat().st_size, flush=True)
    (ROOT / 'reports/images-fonts.json').write_text(json.dumps(dict(images=results, fonts=fonts, sourceCharacters=len(chars)), indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
