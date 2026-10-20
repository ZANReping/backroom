/**
 * Level 1 v2 world plan (wiki: 过道 / 小径).
 *
 * 过道 (halls) are rectangular regions cut by a deterministic BSP inside 480 m
 * super cells. Every BSP split line, and every super-cell border, is widened into
 * a 小径 belt (12–30 m) holding a narrow concrete maze on a global 3 m cell grid:
 * 2 m corridors, 1 m walls. Each hall region belongs to exactly one 区段; adjacent
 * regions may share one. Hall ↔ path interfaces are 2 m metal doors.
 *
 * Pure functions of (seed, world tile); no RNG state, no loaded chunks.
 */
export type L1Section = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'fabled'
export type L1PlanStyle = L1Section|'maintenance'
export type L1RoomType = 'office'|'cell'|'sickbay'|'rubber'|'gallery'|'mattress'|'empty'
export const L1_SECTION_NAMES:Record<L1Section,string>={parking:'天鹰段',storage:'跃金段',gothic:'哥特段',ouroboros:'衔尾段',garden:'花园段',fabled:'传说段'}

export const L1_SUPER=480            // super cell size (m)
const OFFSET=240                       // origin sits in the middle of super cell (0,0)
export const L1_CELL=3                 // maze cell pitch (2 m corridor + 1 m wall)
const NC=L1_SUPER/L1_CELL              // 160 cells per super cell side

export interface L1Region {
 id:string; sx:number; sy:number; index:number
 /** Leaf rectangle (world tiles, half-open) */
 x0:number; y0:number; x1:number; y1:number
 /** Inset per side = half belt width of the bounding split line */
 hl:number; ht:number; hr:number; hb:number
 /** Hall area including its boundary wall line: x∈[ix0,ix1], y∈[iy0,iy1] (inclusive) */
 ix0:number; iy0:number; ix1:number; iy1:number
 section:L1Section
}
export interface L1Room {id:string;type:L1RoomType;x0:number;y0:number;x1:number;y1:number;door:{x:number;y:number;dir:0|1|2|3}}
export interface L1Door {id:string;x:number;y:number;axis:'x'|'y';dir:0|1|2|3;region:string;exitSign:boolean}
interface Seg {id:string;axis:'x'|'y';at:number;a:number;b:number;h:number}
interface Super {
 sx:number; sy:number; x0:number; y0:number
 regions:L1Region[]
 /** bit0 belt, bit1 open to west, bit2 open to north, bit3 room */
 cells:Uint8Array
 rooms:L1Room[]
 doors:L1Door[]
 doorTiles:Set<number>
}

const mod=(n:number,d:number)=>(n%d+d)%d
/** Rows are offset by half a super cell (brick bond): no continuous north–south seams. */
const rowShift=(sy:number)=>mod(sy,2)*(L1_SUPER/2)
const superY=(y:number)=>Math.floor((y+OFFSET)/L1_SUPER)
const superX=(x:number,sy:number)=>Math.floor((x+OFFSET-rowShift(sy))/L1_SUPER)
export function l1PlanHash(...n:number[]){
 let h=0x9e3779b9
 for(const v of n){h=Math.imul(h^(v|0),0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16}
 return (h>>>0)/4294967296
}
const snap=(v:number)=>Math.round(v/L1_CELL)*L1_CELL
/** half belt width of a super-cell border: 6–15 m, multiple of 3 */
const borderHalf=(seed:number,axis:number,a:number,b:number)=>L1_CELL*(2+Math.floor(l1PlanHash(seed,0xb0d,axis,axis?0:a,b)*4))

const SECTION_WEIGHTS:[L1Section,number][]=[['parking',46],['storage',20],['gothic',18],['garden',7],['ouroboros',6],['fabled',3]]
/** 传说段 is the L1 of the past: small fortress halls, never near the modern arrival point. */
export const L1_FABLED_MIN_DIST=1200,L1_FABLED_MAX_SIDE=140,L1_FABLED_CLUSTER_P=.03
function pickSection(seed:number,sx:number,sy:number,i:number,w:number,h:number):L1Section{
 const area=w*h
 // 衔尾段 is the smallest recorded section: only small leaves; compensate weight there.
 const small=area<175*175
 let total=0
 const ws=SECTION_WEIGHTS.map(([s,v])=>{const k=s==='ouroboros'?(small?v*4:0):s==='garden'&&area>320*320?v*.4:s==='fabled'?0:v;total+=k;return [s,k] as [L1Section,number]})
 let u=l1PlanHash(seed,0x5ec,sx,sy,i)*total
 for(const [s,k] of ws){if((u-=k)<0)return s}
 return 'parking'
}

const supers=new Map<string,Super>()
function superAt(seed:number,sx:number,sy:number):Super{
 const key=`${seed}:${sx},${sy}`,hit=supers.get(key);if(hit)return hit
 const s=buildSuper(seed,sx,sy)
 if(supers.size>=24)supers.delete(supers.keys().next().value!)
 supers.set(key,s);return s
}

function buildSuper(seed:number,sx:number,sy:number):Super{
 const X0=sx*L1_SUPER-OFFSET+rowShift(sy),Y0=sy*L1_SUPER-OFFSET,X1=X0+L1_SUPER,Y1=Y0+L1_SUPER
 const hW=borderHalf(seed,0,sx,sy),hE=borderHalf(seed,0,sx+1,sy),hN=borderHalf(seed,1,sx,sy),hS=borderHalf(seed,1,sx,sy+1)
 const segs:Seg[]=[
  // Strips never overlap: a perpendicular strip stops at its parent's edge and is joined there by doorways.
  {id:`bv:${sx},${sy}`,axis:'x',at:X0,a:Y0+hN,b:Y1-hS,h:hW},{id:`bv:${sx+1},${sy}`,axis:'x',at:X1,a:Y0+hN,b:Y1-hS,h:hE},
  // Horizontal seams are shared by two offset rows: split them into 240 m pieces both rows agree on.
  {id:`bh:${Math.floor(X0/240)},${sy}`,axis:'y',at:Y0,a:X0,b:X0+240,h:hN},{id:`bh:${Math.floor(X0/240)+1},${sy}`,axis:'y',at:Y0,a:X0+240,b:X1,h:hN},
  {id:`bh:${Math.floor(X0/240)},${sy+1}`,axis:'y',at:Y1,a:X0,b:X0+240,h:hS},{id:`bh:${Math.floor(X0/240)+1},${sy+1}`,axis:'y',at:Y1,a:X0+240,b:X1,h:hS},
 ]
 type R={x0:number;y0:number;x1:number;y1:number;hl:number;ht:number;hr:number;hb:number;fab?:boolean}
 let leaves:R[]=[]
 const spawn=sx===0&&sy===0
 for(let attempt=0;attempt<40;attempt++){
  leaves=[];segs.length=6
  let n=0
  const split=(r:R,depth:number)=>{
   const w=r.x1-r.x0,h=r.y1-r.y0,k=n++
   const u=l1PlanHash(seed,0x5b1,sx,sy,k,attempt)
   // 传说段 fortress cluster: a far-away block broken into small halls (≤ 140 m), each its own 传说 hall.
   if(!r.fab&&depth>=1&&w<=340&&h<=340&&Math.hypot(Math.max(r.x0,0,-r.x1),Math.max(r.y0,0,-r.y1))>=L1_FABLED_MIN_DIST
    &&l1PlanHash(seed,0xfab,sx,sy,k,attempt)<L1_FABLED_CLUSTER_P)r={...r,fab:true}
   const max=r.fab?L1_FABLED_MAX_SIDE:150+300*l1PlanHash(seed,0x5b2,sx,sy,k,attempt)
   const MINC=r.fab?65:80 // child rect ≥ 80 m: hall interior ≥ 50 m after both belts
   const canX=w>=2*MINC+10,canY=h>=2*MINC+10
   if(depth>0&&(Math.max(w,h)<max||!canX&&!canY)){leaves.push(r);return}
   if(!canX&&!canY){leaves.push(r);return}
   // Prefer cutting across the long side: keeps regions near square (方正).
   const vertical=canX&&(!canY||w>h*1.15||(w>h/1.15&&u<.5))
   const len=vertical?w:h
   const lo=Math.max(MINC,len*.32),hi=Math.min(len-MINC,len*.68)
   const at=snap((vertical?r.x0:r.y0)+lo+(hi-lo)*l1PlanHash(seed,0x5b3,sx,sy,k,attempt))
   const hh=L1_CELL*(2+Math.floor(l1PlanHash(seed,0x5b4,sx,sy,k,attempt)*4))
   segs.push({id:`s:${sx},${sy}:${k}`,axis:vertical?'x':'y',at,a:vertical?r.y0+r.ht:r.x0+r.hl,b:vertical?r.y1-r.hb:r.x1-r.hr,h:hh})
   if(vertical){split({...r,x1:at,hr:hh},depth+1);split({...r,x0:at,hl:hh},depth+1)}
   else{split({...r,y1:at,hb:hh},depth+1);split({...r,y0:at,ht:hh},depth+1)}
  }
  split({x0:X0,y0:Y0,x1:X1,y1:Y1,hl:hW,ht:hN,hr:hE,hb:hS},0)
  if(!spawn)break
  // The player arrives at (15.5,15.5): it must sit inside a broad hall, ≥ 18 m from walls.
  const r=leaves.find(l=>15>=l.x0+l.hl&&15<=l.x1-l.hr&&15>=l.y0+l.ht&&15<=l.y1-l.hb)
  if(r&&15-(r.x0+r.hl)>=18&&(r.x1-r.hr)-15>=18&&15-(r.y0+r.ht)>=18&&(r.y1-r.hb)-15>=18&&(r.x1-r.x0)*(r.y1-r.y0)>=150*150)break
 }
 const regions:L1Region[]=leaves.map((l,i)=>({
  id:`${sx},${sy}:${i}`,sx,sy,index:i,...l,
  ix0:l.x0+l.hl,iy0:l.y0+l.ht,ix1:l.x1-l.hr,iy1:l.y1-l.hb,
  section:l.fab?'fabled':pickSection(seed,sx,sy,i,l.x1-l.x0,l.y1-l.y0),
 }))
 if(spawn){const r=regions.find(q=>15>=q.ix0&&15<=q.ix1&&15>=q.iy0&&15<=q.iy1);if(r)r.section='parking'}

 // ---- 小径 maze on the cell grid ----
 const cells=new Uint8Array(NC*NC)
 const cov=new Uint8Array(NC*NC)
 const strips=segs.map(g=>{
  // world cell rectangle of the strip (may extend outside this super cell)
  const along0=Math.floor(g.a/L1_CELL),along1=Math.floor(g.b/L1_CELL) // [along0,along1)
  const across0=Math.floor((g.at-g.h)/L1_CELL),across1=Math.floor((g.at+g.h)/L1_CELL)
  return g.axis==='x'?{g,gx0:across0,gx1:across1,gy0:along0,gy1:along1}:{g,gx0:along0,gx1:along1,gy0:across0,gy1:across1}
 })
 const SX=X0/L1_CELL,SY=Y0/L1_CELL
 for(const s of strips)for(let gy=s.gy0;gy<s.gy1;gy++)for(let gx=s.gx0;gx<s.gx1;gx++){
  const lx=gx-SX,ly=gy-SY;if(lx<0||ly<0||lx>=NC||ly>=NC)continue
  cov[ly*NC+lx]++;cells[ly*NC+lx]|=1
 }
 const rooms:L1Room[]=[]
 const ROOMS:L1RoomType[]=['office','cell','sickbay','rubber','gallery','mattress','empty','empty']
 for(const s of strips){
  const W=s.gx1-s.gx0,H=s.gy1-s.gy0,N=W*H,g=s.g
  const seedK=Math.floor(l1PlanHash(seed,0x3a2e,g.id.length,...[...g.id].map(c=>c.charCodeAt(0)))*2**31)
  let st=seedK|1
  const rnd=()=>{st^=st<<13;st^=st>>>17;st^=st<<5;return (st>>>0)/4294967296}
  const inThis=(i:number)=>{const lx=s.gx0+i%W-SX,ly=s.gy0+Math.floor(i/W)-SY;return lx>=0&&ly>=0&&lx<NC&&ly<NC}
  const covAt=(i:number)=>{const lx=s.gx0+i%W-SX,ly=s.gy0+Math.floor(i/W)-SY;return lx>=0&&ly>=0&&lx<NC&&ly<NC?cov[ly*NC+lx]:1}
  // Rooms first (as blocked super-nodes), only where this strip alone covers the cells.
  const block=new Int16Array(N).fill(-1)
  const across=g.axis==='x'?W:H,along=g.axis==='x'?H:W
  const myRooms:{i0:number;w:number;h:number;type:L1RoomType;r:number}[]=[]
  if(across>=4&&g.id[0]!=='b'){
   for(let p=3;p<along-5;){
    const rw=2+Math.floor(rnd()*2),rh=2+Math.floor(rnd()*2) // along × across, cells
    const off=rnd()<.5?0:across-rh
    const ax=p,ay=off
    let ok=ax+rw<along-2
    for(let j=0;j<rh&&ok;j++)for(let k=0;k<rw&&ok;k++){
     const gx=g.axis==='x'?ay+j:ax+k,gy=g.axis==='x'?ax+k:ay+j,i=gy*W+gx
     if(covAt(i)!==1)ok=false
    }
    if(ok&&rnd()<.55){
     const w=g.axis==='x'?rh:rw,h=g.axis==='x'?rw:rh,gx=g.axis==='x'?ay:ax,gy=g.axis==='x'?ax:ay
     const r=myRooms.length
     myRooms.push({i0:gy*W+gx,w,h,type:ROOMS[Math.floor(rnd()*ROOMS.length)],r})
     for(let j=0;j<h;j++)for(let k=0;k<w;k++)block[(gy+j)*W+gx+k]=r
     p+=rw+3+Math.floor(rnd()*6)
    }else p+=2+Math.floor(rnd()*4)
   }
  }
  // Perfect maze (iterative DFS) over the remaining cells; then ~7% extra loops.
  const openW=new Uint8Array(N),openN=new Uint8Array(N),seen=new Uint8Array(N)
  const start=Math.floor(N/2)
  let s0=start;while(block[s0]>=0)s0=(s0+1)%N
  const stack=[s0];seen[s0]=1
  while(stack.length){
   const c=stack[stack.length-1],x=c%W,y=(c-x)/W
   const opts:number[]=[]
   if(x>0&&!seen[c-1]&&block[c-1]<0)opts.push(0)
   if(x<W-1&&!seen[c+1]&&block[c+1]<0)opts.push(1)
   if(y>0&&!seen[c-W]&&block[c-W]<0)opts.push(2)
   if(y<H-1&&!seen[c+W]&&block[c+W]<0)opts.push(3)
   if(!opts.length){stack.pop();continue}
   // bias along the strip: long corridors, fewer zigzags
   let d=opts[Math.floor(rnd()*opts.length)]
   const alongDirs=g.axis==='x'?[2,3]:[0,1]
   if(rnd()<.35){const a=opts.filter(o=>alongDirs.includes(o));if(a.length)d=a[Math.floor(rnd()*a.length)]}
   const n=d===0?c-1:d===1?c+1:d===2?c-W:c+W
   if(d===0)openW[c]=1;else if(d===1)openW[n]=1;else if(d===2)openN[c]=1;else openN[n]=1
   seen[n]=1;stack.push(n)
  }
  for(let c=0;c<N;c++){
   const x=c%W
   if(block[c]>=0)continue
   if(x>0&&block[c-1]<0&&!openW[c]&&rnd()<.07)openW[c]=1
   if(c>=W&&block[c-W]<0&&!openN[c]&&rnd()<.07)openN[c]=1
  }
  // Rooms: merge inside, single doorway to an adjacent maze cell.
  for(const R of myRooms){
   const gx0=R.i0%W,gy0=Math.floor(R.i0/W)
   for(let j=0;j<R.h;j++)for(let k=0;k<R.w;k++){
    const c=(gy0+j)*W+gx0+k
    if(k>0)openW[c]=1;if(j>0)openN[c]=1
   }
   // door on the side facing the strip interior
   const cand:{c:number;dir:0|1|2|3}[]=[]
   for(let k=0;k<R.w;k++){
    if(gy0>0&&block[(gy0-1)*W+gx0+k]<0)cand.push({c:gy0*W+gx0+k,dir:2})
    if(gy0+R.h<H&&block[(gy0+R.h)*W+gx0+k]<0)cand.push({c:(gy0+R.h-1)*W+gx0+k,dir:3})
   }
   for(let j=0;j<R.h;j++){
    if(gx0>0&&block[(gy0+j)*W+gx0-1]<0)cand.push({c:(gy0+j)*W+gx0,dir:0})
    if(gx0+R.w<W&&block[(gy0+j)*W+gx0+R.w]<0)cand.push({c:(gy0+j)*W+gx0+R.w-1,dir:1})
   }
   if(!cand.length)continue
   const dd=cand[Math.floor(rnd()*cand.length)]
   if(dd.dir===0)openW[dd.c]=1;else if(dd.dir===1)openW[dd.c+1]=1;else if(dd.dir===2)openN[dd.c]=1;else openN[dd.c+W]=1
   const wx=(s.gx0+gx0)*L1_CELL,wy=(s.gy0+gy0)*L1_CELL
   const cxw=(s.gx0+dd.c%W)*L1_CELL,cyw=(s.gy0+Math.floor(dd.c/W))*L1_CELL
   const room:L1Room={id:`${g.id}:r${R.r}`,type:R.type,x0:wx+1,y0:wy+1,x1:wx+R.w*L1_CELL,y1:wy+R.h*L1_CELL,
    door:dd.dir===0?{x:cxw,y:cyw+1,dir:0}:dd.dir===1?{x:cxw+L1_CELL,y:cyw+1,dir:1}:dd.dir===2?{x:cxw+1,y:cyw,dir:2}:{x:cxw+1,y:cyw+L1_CELL,dir:3}}
   if(room.x0>=X0&&room.y0>=Y0&&room.x0<X1&&room.y0<Y1)rooms.push(room)
  }
  // write into the super-cell grid (OR of all strips covering a cell)
  for(let c=0;c<N;c++){
   if(!inThis(c))continue
   const lx=s.gx0+c%W-SX,ly=s.gy0+Math.floor(c/W)-SY,k=ly*NC+lx
   if(openW[c])cells[k]|=2
   if(openN[c])cells[k]|=4
   if(block[c]>=0)cells[k]|=8
  }
  // Join both ends to the perpendicular strips (1–2 doorways each).
  for(const end of [0,1]){
   const n=1+(rnd()<.45?1:0)
   for(let j=0;j<n;j++){
    const t=Math.floor(rnd()*(g.axis==='x'?W:H))
    let gx:number,gy:number,bit:number
    if(g.axis==='x'){gx=s.gx0+t;gy=end?s.gy1:s.gy0;bit=4}
    else{gy=s.gy0+t;gx=end?s.gx1:s.gx0;bit=2}
    const lx=gx-SX,ly=gy-SY
    if(lx>=0&&ly>=0&&lx<NC&&ly<NC)cells[ly*NC+lx]|=bit
   }
  }
 }
 // ---- doors between halls and the surrounding paths ----
 const doors:L1Door[]=[],doorTiles=new Set<number>()
 const key=(x:number,y:number)=>(x-X0+1)*4096+(y-Y0+1)
 for(const r of regions){
  // A boundary tile line is shared with the path belt; doors open into an adjacent maze cell.
  const sides:[0|1|2|3,number,number,number][]=[[0,r.ix0,r.iy0,r.iy1],[1,r.ix1,r.iy0,r.iy1],[2,r.iy0,r.ix0,r.ix1],[3,r.iy1,r.ix0,r.ix1]]
  for(const [dir,line,a,b] of sides){
   const len=b-a
   let t=a+9+Math.floor(l1PlanHash(seed,0xd0,sx,sy,r.index,dir)*30)
   let n=0
   while(t<b-6){
    const p=Math.floor(t/L1_CELL)*L1_CELL+1
    if(p>a+2&&p+2<b-1){
     const axis=dir<2?'x':'y'
     const x=dir<2?line:p,y=dir<2?p:line
     // the belt cell this door opens into must be inside this super cell (or the door is owned by the neighbour)
     const ox=dir===0?x-1:dir===1?x+1:x,oy=dir===2?y-1:dir===3?y+1:y
     if(ox>=X0&&oy>=Y0&&ox<X1&&oy<Y1){
      const exitSign=l1PlanHash(seed,0xe7,x,y)<.4
      doors.push({id:`d:${x},${y}`,x,y,axis,dir,region:r.id,exitSign})
      for(let k=0;k<2;k++)doorTiles.add(axis==='x'?key(x,y+k):key(x+k,y))
      n++
     }
    }
    t+=40+Math.floor(l1PlanHash(seed,0xd1,sx,sy,r.index,dir,n,t)*50)
   }
   void len
  }
 }
 return {sx,sy,x0:X0,y0:Y0,regions,cells,rooms,doors,doorTiles}
}

export function l1RegionAt(seed:number,x:number,y:number):L1Region|undefined{
 const sy=superY(y),s=superAt(seed,superX(x,sy),sy)
 for(const r of s.regions)if(x>=r.ix0&&x<=r.ix1&&y>=r.iy0&&y<=r.iy1)return r
 return undefined
}
export interface L1PlanTile {floor:boolean;style:L1PlanStyle;region?:L1Region;room?:boolean;door?:boolean;wallOf?:L1Section}
/** Tile classification for world tile (floor(x), floor(y)). */
export function l1PlanTile(seed:number,X:number,Y:number):L1PlanTile{
 const x=Math.floor(X),y=Math.floor(Y),sy=superY(y),s=superAt(seed,superX(x,sy),sy)
 for(const r of s.regions)if(x>=r.ix0&&x<=r.ix1&&y>=r.iy0&&y<=r.iy1){
  const edge=x===r.ix0||x===r.ix1||y===r.iy0||y===r.iy1
  if(!edge)return {floor:true,style:r.section,region:r}
  const door=s.doorTiles.has((x-s.x0+1)*4096+(y-s.y0+1))
  return {floor:door,style:r.section,region:r,door,wallOf:r.section}
 }
 const gx=Math.floor((x-s.x0)/L1_CELL),gy=Math.floor((y-s.y0)/L1_CELL),c=s.cells[gy*NC+gx]
 const lx=mod(x-s.x0,L1_CELL),ly=mod(y-s.y0,L1_CELL)
 if(!(c&1))return {floor:false,style:'maintenance'}
 const room=!!(c&8)
 if(lx===0&&ly===0)return {floor:room&&(c&6)===6,style:'maintenance',room}
 if(lx===0)return {floor:!!(c&2),style:'maintenance',room}
 if(ly===0)return {floor:!!(c&4),style:'maintenance',room}
 return {floor:true,style:'maintenance',room}
}
export function l1PlanRooms(seed:number,x0:number,y0:number,x1:number,y1:number):L1Room[]{
 const out:L1Room[]=[]
 for(let sy=superY(y0);sy<=superY(y1);sy++)for(let sx=superX(x0,sy);sx<=superX(x1,sy);sx++)
  for(const r of superAt(seed,sx,sy).rooms)if(r.x1>x0&&r.x0<x1&&r.y1>y0&&r.y0<y1)out.push(r)
 return out
}
export function l1PlanDoors(seed:number,x0:number,y0:number,x1:number,y1:number):L1Door[]{
 const out:L1Door[]=[]
 for(let sy=superY(y0-1);sy<=superY(y1+1);sy++)for(let sx=superX(x0-1,sy);sx<=superX(x1+1,sy);sx++)
  for(const d of superAt(seed,sx,sy).doors)if(d.x>=x0&&d.x<x1&&d.y>=y0&&d.y<y1)out.push(d)
 return out
}
export function l1PlanRegions(seed:number,x0:number,y0:number,x1:number,y1:number):L1Region[]{
 const out:L1Region[]=[]
 for(let sy=superY(y0);sy<=superY(y1);sy++)for(let sx=superX(x0,sy);sx<=superX(x1,sy);sx++)
  for(const r of superAt(seed,sx,sy).regions)if(r.ix1>=x0&&r.ix0<x1&&r.iy1>=y0&&r.iy0<y1)out.push(r)
 return out
}
