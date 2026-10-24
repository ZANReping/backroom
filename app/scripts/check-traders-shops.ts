import {FIREARM_PRICES,AMMO,isAmmo} from '../src/game/content/firearms'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {NPCS} from '../src/game/content/npcs'
import {TRADERS_ROOMS,TRADERS_FIXED_PEOPLE,tradersContains} from '../src/game/content/tradersLayout'
import {MARKET_RESERVED_PEOPLE,MARKET_PRICES} from '../src/game/content/tradersMarket'
import {TRADERS_SHOPS,TRADERS_SHOP_PROPS,TRADERS_SHOP_PEOPLE,TRADERS_SHOP_HOMES,tradersShopFrame,tradersShopAt,tradersShopLights,shopSurface,TRADERS_SHOP_UV} from '../src/game/content/tradersShops'
import {TRADERS_SIGN_ATLAS} from '../src/game/content/tradersSignAtlas'
import {tradersRoomSign} from '../src/game/content/tradersSigns'
import {tradersDressingColliders} from '../src/game/content/tradersDressingShapes'
import {tradersLightsForChunk,tradersHomes} from '../src/game/world/tradersWorld'
import {npcGearPlan} from '../src/game/renderer/npcGearPlan'
import {npcAvatar} from '../src/game/content/npcs'
let checks=0;const ok=(v:unknown,m:string)=>{assert(v,m);checks++}
const report:Record<string,unknown>={}
ok(TRADERS_SHOPS.length===6&&new Set(TRADERS_SHOPS.map(s=>s.room)).size===6,'six shops in six rooms')
ok(TRADERS_SHOPS.map(s=>s.room).join(',')==='N02,N04,N07,N10,N14,N12','north row N02/N04/N07/N10/N12 + N14 gun shop')
// Textures: every shop ships its own floor / wall / ceiling set, and no two shops share an image.
const hashes=new Map<string,string>()
for(const s of TRADERS_SHOPS)for(const part of ['floor','wall','ceiling'] as const)for(const map of ['color','normalgl','roughness']){
 const f=`public/textures/traders/shops/${s.tex}_${part}_${map}.jpg`;ok(existsSync(f),'texture ships '+f)
 if(map==='color'){const h=createHash('md5').update(readFileSync(f)).digest('hex');ok(!hashes.has(h),'unique texture '+f);hashes.set(h,f)}
 ok(TRADERS_SHOP_UV[shopSurface(s,part)]>0,'uv repeat '+shopSurface(s,part))
}
ok(hashes.size===18,'18 distinct surface textures')
const solids=TRADERS_SHOP_PROPS.flatMap(s=>tradersDressingColliders(s)).filter(c=>c.bottom<1.8)
const blocked=(x:number,y:number,r=.3)=>solids.some(c=>x+r>c.x0&&x-r<c.x1&&y+r>c.y0&&y-r<c.y1)
const out:Record<string,unknown>[]=[]
for(const s of TRADERS_SHOPS){
 const f=tradersShopFrame(s),r=f.r,mine=TRADERS_SHOP_PROPS.filter(p=>p.data?.shop===s.id)
 ok(r.kind==='shop'&&r.side==='s','shop room faces the north mall '+s.room)
 ok(tradersRoomSign(r.id)==='shop_'+r.id&&TRADERS_SIGN_ATLAS['shop_'+r.id],'fascia sign '+r.id)
 ok(mine.length>=9,'furnished '+s.id)
 for(const p of mine){ok(tradersContains(r,p.x+p.w/2,p.y+p.h/2),'prop inside shop '+p.data?.tradersId);if(p.data?.sign)ok(TRADERS_SIGN_ATLAS[String(p.data.sign)],'prop sign '+p.data.sign)}
 for(const p of mine)if(p.solid)ok(p.x>=r.x+.05&&p.y>=r.y+.05&&p.x+p.w<=r.x+r.w-.05&&p.y+p.h<=r.y+r.h-.05,'solid prop clear of walls '+p.data?.tradersId)
 // Doorway and entry zone stay clear; walk from the door to the counter front on a 0.2 m grid.
 for(let y=r.y+r.h-5.5;y<r.y+r.h;y+=.25)for(let x=f.cx-1.6;x<=f.cx+1.6;x+=.4)ok(!blocked(x,y,.25),'door path clear '+s.id)
 const vendor=TRADERS_SHOP_HOMES.find(h=>h.id===s.vendor)??TRADERS_FIXED_PEOPLE.find(h=>h.id===s.vendor)!
 const counter=mine.find(p=>/Counter$/.test(String(p.data?.part)))!,goal={x:vendor.x,y:counter.y+counter.h+.55}
 const step=.2,W=Math.round(r.w/step),H=Math.round(r.h/step),seen=new Uint8Array(W*H),q:number[]=[]
 const cell=(x:number,y:number)=>Math.round((y-r.y)/step)*W+Math.round((x-r.x)/step)
 const free=(i:number)=>{const x=r.x+(i%W)*step,y=r.y+Math.floor(i/W)*step;return x>r.x+.4&&x<r.x+r.w-.4&&y>r.y+.4&&!blocked(x,y,.3)}
 const start=cell(f.cx,r.y+r.h-.3);q.push(start);seen[start]=1;let reached=false
 while(q.length){const i=q.shift()!;if(Math.abs(r.x+(i%W)*step-goal.x)<.3&&Math.abs(r.y+Math.floor(i/W)*step-goal.y)<.3){reached=true;break}
  for(const n of [i-1,i+1,i-W,i+W])if(n>=0&&n<W*H&&!seen[n]&&Math.abs((n%W)-(i%W))<=1){seen[n]=1;if(free(n))q.push(n)}}
 ok(reached,'customer can walk from the door to the counter '+s.id)
 ok(tradersContains(r,vendor.x,vendor.y)&&!blocked(vendor.x,vendor.y,.25),'owner stands free behind the counter '+s.vendor)
 const st=TRADERS_SHOP_HOMES.find(h=>h.id===s.staff)!;ok(tradersContains(r,st.x,st.y)&&!blocked(st.x,st.y,.25),'staff stands free '+s.staff)
 // Lights: own fixtures and colour, no corridor troffers inside.
 const L=tradersShopLights(r);ok(L.length===s.lights.length&&L.every(l=>l.color===s.light),'shop lights '+s.id)
 const chunkLights=[...new Set([[Math.floor(r.x/32),Math.floor(r.y/32)],[Math.floor((r.x+r.w)/32),Math.floor((r.y+r.h)/32)]].map(a=>a.join(',')))].flatMap(k=>{const [cx,cy]=k.split(',').map(Number);return tradersLightsForChunk(cx,cy)})
 ok(chunkLights.filter(l=>tradersContains(r,l.x,l.y)).every(l=>l.color===s.light),'no generic grid light inside '+s.id)
 out.push({shop:s.id,room:s.room,props:mine.length,colliders:solids.filter(c=>tradersContains(r,(c.x0+c.x1)/2,(c.y0+c.y1)/2)).length,light:s.light,lights:L.length})
}
ok(new Set(TRADERS_SHOPS.map(s=>s.light)).size===6,'six distinct light colours')
ok(!tradersShopAt(TRADERS_ROOMS.find(r=>r.id==='N01')!.x+5,20),'other north units stay vacant')
// People: owners keep their reserved goods and prices; candyman keeps his barter and moves into N07.
for(const s of TRADERS_SHOPS){
 const d=s.vendor==='candyman'?NPCS.candyman:TRADERS_SHOP_PEOPLE[s.vendor]
 if(s.vendor==='candyman'){ok(d.barter?.length===7,'candy barter kept');const c=TRADERS_FIXED_PEOPLE.find(p=>p.id==='candyman')!;ok(tradersShopAt(c.x,c.y)?.id==='candy','candyman stands in his shop')}
 else if(s.id==='guns'){for(const t of d.trade!)ok(t.price===FIREARM_PRICES[t.item]&&(!isAmmo(t.item)||t.qty===AMMO[t.item].box),'gun shop price '+t.item);ok(d.trade!.length===11,'gun shop sells 5 guns + 6 ammo')}
 else{ok(JSON.stringify(d.trade)===JSON.stringify(MARKET_RESERVED_PEOPLE[s.vendor].trade),'owner keeps reserved stock '+s.vendor);for(const t of d.trade!)ok(t.price===MARKET_PRICES[t.item],'price '+t.item);}
 if(s.vendor!=='candyman')ok(d.lines[0].opts.some(o=>o.action==='trade'),'owner trades '+s.vendor)
 ok(TRADERS_SHOP_PEOPLE[s.staff]&&!NPCS[s.staff],'local staff def '+s.staff)
}
const looks=new Set<string>(),people=TRADERS_SHOPS.flatMap(s=>[s.vendor,s.staff])
for(const id of people){const d=id==='candyman'?NPCS.candyman:TRADERS_SHOP_PEOPLE[id],a=npcAvatar(d);const key=JSON.stringify([a.hair,a.hairColor,a.top,a.topStyle,a.beard,a.glasses,a.skin,a.pantsStyle,npcGearPlan(id,d).map(g=>g.kind+g.variant)]);ok(!looks.has(key),'unique look '+id);looks.add(key)}
const homes=tradersHomes(1);ok(new Set(homes.map(h=>h.id)).size===homes.length,'unique traders homes')
for(const id of people)ok(homes.some(h=>h.id===id),'spawned in world '+id)
report.shops=out;report.checks=checks
mkdirSync('reports/traders-shops',{recursive:true});writeFileSync('reports/traders-shops/check.json',JSON.stringify(report,null,1))
console.log(`Traders north shops: ${checks} checks passed (6 shops, ${TRADERS_SHOP_PROPS.length} props, ${people.length} people)`)
