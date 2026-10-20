import {l1PlanTile} from '../src/game/world/l1Plan'
const seed=+(process.argv[2]??20261006),R=+(process.argv[3]??1200),N=2*R
const f=new Uint8Array(N*N)
for(let y=0;y<N;y++)for(let x=0;x<N;x++)f[y*N+x]=l1PlanTile(seed,x-R,y-R).floor?1:0
const q=new Int32Array(N*N);let h=0,t=0;const s=(R+15)*N+R+15
if(!f[s])throw new Error('spawn not floor');q[t++]=s;f[s]=2
while(h<t){const c=q[h++],x=c%N;for(const n of [x>0?c-1:-1,x<N-1?c+1:-1,c-N,c+N])if(n>=0&&n<N*N&&f[n]===1){f[n]=2;q[t++]=n}}
let un=0,tot=0;const M=300
for(let y=M;y<N-M;y++)for(let x=M;x<N-M;x++){if(f[y*N+x])tot++;if(f[y*N+x]===1)un++}
console.log(JSON.stringify({seed,floorInner:tot,unreached:un,pct:+(100*un/tot).toFixed(3)}))
