import assert from 'node:assert/strict'
import { l11CrossingPositions } from '../src/game/world/l11RoadMarkings'
import { l11CityPlan } from '../src/game/world/l11Layout'
import { bounds, strip, clipping, area } from '../src/game/world/l11Geometry'
import type { L11Road } from '../src/game/world/l11Types'

const road=(id:string,points:[number,number][],width=8):L11Road=>{const polygon=[strip(points[0],points[1],width)];return {id,points,width,sidewalk:3,class:'collector',polygon,bounds:bounds(polygon)}}
const center=(r:L11Road,t:number):[number,number]=>{const a=r.points[0],b=r.points[1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return[a[0]+(b[0]-a[0])*t/len,a[1]+(b[1]-a[1])*t/len]}
const check=(name:string,actual:number[],expected:number)=>assert.equal(actual.length,expected,`${name}: ${actual.join(',')}`)

const east=road('east',[[ -50,0],[50,0]]),north=road('north',[[0,-50],[0,50]])
check('orthogonal cross',l11CrossingPositions(east,1,[east,north]),2)
const tee=road('tee',[[-50,0],[10,0]]),branch=road('branch',[[10,0],[10,50]])
check('T junction',l11CrossingPositions(tee,1,[tee,branch]),1)
const diagonal=road('diagonal',[[-50,-50],[50,50]]),cross=road('cross',[[-50,0],[50,0]])
const diagonalPositions=l11CrossingPositions(diagonal,1,[diagonal,cross]);check('45 degree cross',diagonalPositions,2)
for(const t of diagonalPositions){const q=center(diagonal,t-1.4),r=center(diagonal,t+1.4),envelope=strip(q,r,diagonal.width)
  assert(envelope[0].every(([x,y])=>Number.isFinite(x+y)),'diagonal envelope finite')
  assert(!clipping.intersection(envelope,cross.polygon).some(p=>area(p)>.001),'diagonal crossing overlaps cross road')
}
const parallel=road('parallel',[[-50,12],[50,12]])
check('parallel roads',l11CrossingPositions(east,1,[east,parallel]),0)
check('duplicate axis roads',l11CrossingPositions(east,1,[east,north,north]),2)
const shifted=[road('east2',[[-50-123,0-77],[50-123,0-77]]),road('north2',[[-123,-50-77],[-123,50-77]])]
assert.deepEqual(l11CrossingPositions(shifted[0],1,shifted),l11CrossingPositions(east,1,[east,north]),'negative/translated geometry invariant')

const reference=l11CityPlan(20261014,0,0)
assert(reference.roads.some(r=>r.points.some(p=>Math.abs(p[0]-272)<1e-6)),'reference x=272 road exists')
assert(reference.roads.some(r=>r.points.some(p=>Math.abs(p[1]-400)<1e-6)),'reference y=400 road exists')
const avenue=reference.roads.find(r=>r.class==='arterial'&&r.points.every(p=>Math.abs(p[0]-272)<1e-6))!
assert(avenue,'reference avenue exists')
const crossings=l11CrossingPositions(avenue,1,reference.roads).map(t=>center(avenue,t)[1])
assert(crossings.some(y=>y>389&&y<399)&&crossings.some(y=>y>401&&y<411),'crossings border the actual y=400 intersection')
const ordinary=l11CityPlan(42,0,0)
assert(ordinary.roads.some(r=>r.points.length>1&&l11CrossingPositions(r,1,ordinary.roads).length>0),'ordinary seed crossing exists')
console.log(JSON.stringify({ok:true,orthogonal:2,tee:1,diagonal:2,parallel:0,duplicates:2,reference:true,ordinary:true}))
