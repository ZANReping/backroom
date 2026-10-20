cd /workspace/work/ui/l1v2; bash /workspace/work/ui/setup.sh >/dev/null 2>&1
O=${OUT:-game3}
run(){ P=$1 timeout 400 python3 game.py $O $2 2>&1 | grep --line-buffered -E "^eval|^shot|CONTEXT_LOST|pageerror" | cut -c1-200; }
# SwiftShader loses the context intermittently: retry once if lost or any shot is blank white.
white(){ python3 - "$O" "$1" <<'PY'
import json,sys
from PIL import Image,ImageStat
st=json.load(open(sys.argv[2]));bad=0
for s in st:
  if s[0]=='shot':
    try:
      S=ImageStat.Stat(Image.open(f'{sys.argv[1]}/{s[1]}.png').convert('L'));m=S.mean[0];sd=S.stddev[0]
    except Exception: m=255;sd=0
    if m>225 or sd<4: bad=1
print(bad)
PY
}
for f in "$@"; do echo "== $f"; out=$(run $((3410+RANDOM%80)) $f); echo "$out"; if [ "$(white $f)" = 1 ]; then echo "-- retry $f"; run $((3500+RANDOM%80)) $f; fi; done
