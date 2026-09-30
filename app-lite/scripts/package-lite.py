"""Package dist contents at ZIP root, enforce both compressed and unpacked 50 MB limits."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 50_000_000
subprocess.run(['node', str(ROOT / 'scripts/check-lite.mjs')], check=True)
dist = ROOT / 'dist'
files = sorted(p for p in dist.rglob('*') if p.is_file())
unpacked = sum(p.stat().st_size for p in files)
assert unpacked <= LIMIT
out = ROOT / 'backrooms-lite.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in files:
        assert not p.is_symlink()
        archive.write(p, p.relative_to(dist).as_posix())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist()
    assert sum(i.file_size for i in archive.infolist()) == unpacked
assert out.stat().st_size <= LIMIT
summary = dict(limitBytes=LIMIT, originalPublicBytes=sum(p.stat().st_size for p in (ROOT.parent / 'app/public').rglob('*') if p.is_file()),
    litePublicBytes=sum(p.stat().st_size for p in (ROOT / 'public').rglob('*') if p.is_file()),
    distBytes=unpacked, zipBytes=out.stat().st_size, distFiles=len(files),
    remainingUnpackedBytes=LIMIT-unpacked, zipSHA256=hashlib.sha256(out.read_bytes()).hexdigest())
(ROOT / 'reports/package.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
