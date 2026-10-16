import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {l11CityPlan,l11World,clearL11PlanCache} from '../src/game/world/l11Layout'
import {L11_ROAD_EXITS,L11_EXIT_BUILDING_SPACING,L11_EXIT_SIGN_SPACING} from '../src/game/world/l11ExitPlan'
import {genL11ChunkRaw} from '../src/game/world/l11Raw'
import {l11InteriorPlan} from '../src/game/world/l11Interiors'
import {l11RoomFixtures} from '../src/game/world/l11RoomFurnishing'
import {l11SpecialBuildingParts,l11ShaftParts} from '../src/game/world/l11ExitGeometry'
import {L11} from '../src/game/levels/l11'
const counts:Record<string,number>={},cases:any[]=[]
for(const seed of [42,-17,74911,20261006])for(const [mx,my]of [[0,0],[-1,-1],[1,-1]]){
  const plan=l11CityPlan(seed,mx,my),exits=plan.buildings.filter(b=>b.exit&&b.exit.kind!=='basebeta')
  assert(plan.id.startsWith('l11v2:'),'unchanged stable instance identity namespace')
  assert(plan.buildings.filter(b=>b.archetype==='unfinished-frame'||b.archetype==='barred-brick').every(b=>b.exit),'special exit shells cannot enter the common building pool')
  assert(exits.length<=4);assert.equal(new Set(exits.map(b=>b.blockId)).size,exits.length)
  assert.equal(new Set(exits.map(b=>b.exit!.kind)).size,exits.length)
  for(const b of exits){const q=b.exit!;counts[q.kind]=(counts[q.kind]??0)+1
    assert(b.x>plan.bounds.x+120&&b.y>plan.bounds.y+120&&b.x+b.w<plan.bounds.x+plan.bounds.w-120&&b.y+b.h<plan.bounds.y+plan.bounds.h-120,'rotated footprint retains macro boundary spacing')
    for(const other of exits)if(other!==b)assert(Math.hypot(b.x+b.w/2-other.x-other.w/2,b.y+b.h/2-other.y-other.h/2)>=L11_EXIT_BUILDING_SPACING)
    const [x,y]=l11World(b,...q.center),cx=Math.floor(x/32),cy=Math.floor(y/32),raw=genL11ChunkRaw(L11,seed,cx,cy),e=raw.exits.find(e=>e.l11?.buildingId===b.id)
    assert(e,`${q.kind} owned by correct chunk`);assert.equal(e.floor,q.floor);assert.equal(e.z,b.base+q.floor*3+.02)
    assert.equal(e.l11!.angle,b.angle+q.angle);assert.equal(e.x+.5,x);assert.equal(e.y+.5,y)
    assert.deepEqual(genL11ChunkRaw(L11,seed,cx,cy,undefined,8).exits,raw.exits,'dressing changes preserve exits')
    for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]])assert(!genL11ChunkRaw(L11,seed,cx+dx,cy+dy).exits.some(e=>e.l11?.buildingId===b.id),'no duplicated neighbour exit')
    if(q.kind==='l11officedoor'){assert(q.floor>0&&b.accessible>q.floor);assert(l11InteriorPlan(b).floors[q.floor].rooms.some(r=>r.id===q.roomId&&r.kind==='workspace'))}
    if(b.archetype==='unfinished-frame'){assert.equal(l11RoomFixtures(b).length,0);assert.equal(b.accessible,q.kind==='l11liftshaft'?1:0);assert(l11SpecialBuildingParts(b).every(p=>p.surface!=='glass'));assert.equal(l11ShaftParts(b).length>0,q.kind==='l11liftshaft')}
    if(b.archetype==='barred-brick'){const parts=l11SpecialBuildingParts(b);assert(parts.some(p=>p.surface==='glass'));assert(parts.filter(p=>p.surface==='metal'&&p.w===.035).length>12);assert((b.front==='n'||b.front==='s'?b.width:b.depth)<=13);const glass=parts.find(p=>p.surface==='glass')!;assert((q.center[0]-glass.x)*Math.cos(q.angle)+(q.center[1]-glass.z)*Math.sin(q.angle)>0,'reference door remains left of grille when viewed from street')}
  }
  const before=JSON.stringify(exits);clearL11PlanCache();l11CityPlan(seed,mx+1,my);assert.equal(JSON.stringify(l11CityPlan(seed,mx,my).buildings.filter(b=>b.exit&&b.exit.kind!=='basebeta')),before,'loading order')
  cases.push({seed,mx,my,total:plan.buildings.length,exits:exits.map(b=>({id:b.id,kind:b.exit!.kind,door:l11World(b,...b.exit!.center),floor:b.exit!.floor}))})
}
for(const kind of ['l11unfinisheddoor','l11liftshaft','l11brickdoor','l11officedoor'])assert(counts[kind]>0,kind+' occurs in random worlds')
assert(L11_ROAD_EXITS.length<=2);assert(Math.hypot(L11_ROAD_EXITS[0].x-L11_ROAD_EXITS[1].x,L11_ROAD_EXITS[0].y-L11_ROAD_EXITS[1].y)>=L11_EXIT_SIGN_SPACING)
mkdirSync('reports/l11-exits',{recursive:true});writeFileSync('reports/l11-exits/generation.json',JSON.stringify({counts,cases},null,2));console.log(JSON.stringify({ok:true,counts,plans:cases.length}))
