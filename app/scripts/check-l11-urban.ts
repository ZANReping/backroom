import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { L11_BUILDINGS,L11_FLOOR_RANGES } from '../src/game/content/l11Buildings'
import { l11DecorDef } from '../src/game/content/l11Decor'
import { l11CityPlan,l11StairRect } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { inPolygon,segmentDistance,circlePolygon,rectangle,transform } from '../src/game/world/l11Geometry'
const report={buildings:0,floors:0,rooms:0,doors:0,fixtures:0,units:0,kinds:{} as Record<string,number>,byArchetype:{} as Record<string,number>,missingFurniture:[] as unknown[],failures:[] as unknown[]}
for(const seed of [42,20261006,-17])for(const [mx,my]of [[0,0],[-1,-1]]){
  const buildings=l11CityPlan(seed,mx,my).buildings
  for(const b of buildings){
    assert(b.floors>=L11_FLOOR_RANGES[b.archetype][0],`${b.id} minimum floors`)
    assert(b.volumes.filter(v=>v.lo===0).every(v=>v.hi>=9||b.architecture==='ribbon-twins'&&b.volumes.filter(q=>q.lo===v.hi&&q.hi>=9).reduce((sum,q)=>sum+q.w*q.d,0)>=v.w*v.d*.7),`${b.id} no single-storey wings ${JSON.stringify({recipe:b.sourceRecipe,architecture:b.architecture,volumes:b.volumes})}`)
    if(b.sealed)continue
    // Bound expensive independent path sampling while covering every prototype
    // and both signed coordinate domains for each seed.
    const key=seed+':'+mx+':'+b.archetype
    if((report.byArchetype[key]??0)>=1)continue
    report.byArchetype[key]=(report.byArchetype[key]??0)+1;report.buildings++
    const plan=l11InteriorPlan(b),fixtures=l11RoomFixtures(b)
    assert(plan.floors.length===b.accessible)
    for(const f of plan.floors){
      report.floors++;report.rooms+=f.rooms.length;report.doors+=f.doors.length
      for(const r of f.rooms){
        report.kinds[r.kind]=(report.kinds[r.kind]??0)+1
        const required=r.kind==='bedroom'||r.kind==='studio'?['bed']:r.kind==='bathroom'?['toilet','wash_basin']:r.kind==='living'?['sofa','kitchen_counter']:r.kind==='workspace'?['office_desk']:r.kind==='classroom'?['classroom_desk']:[]
        for(const key of required)if(!fixtures.some(p=>p.roomId===r.id&&(p.key===key||key==='sofa'&&p.key==='armchair')))report.missingFurniture.push({building:b.id,archetype:b.archetype,room:r,key})
      }
      for(const p of fixtures.filter(p=>p.floor===f.floor)){assert(l11DecorDef('l11_'+p.key),p.key+' registered');assert(f.rooms.some(r=>r.id===p.roomId));report.fixtures++}
      report.units+=new Set(f.rooms.map(r=>r.unit).filter(Boolean)).size
      const obstacles=fixtures.filter(p=>p.floor===f.floor&&p.key!=='ceiling_light').map(p=>{const d=l11DecorDef('l11_'+p.key)!;return transform(rectangle(-d.w/2,-d.d/2,d.w,d.d),p.x,p.y,p.angle)})
      const step=.25,nx=Math.ceil(b.width/step),ny=Math.ceil(b.depth/step),valid=new Uint8Array(nx*ny),seen=new Uint8Array(nx*ny)
      const pt=(i:number):[number,number]=>[(i%nx+.5)*step,(Math.floor(i/nx)+.5)*step]
      for(let i=0;i<valid.length;i++){
        const [x,y]=pt(i)
        if(!inPolygon(x,y,b.localFootprint)||b.localFootprint.some(r=>r.slice(1).some((p,j)=>segmentDistance(x,y,r[j],p)<.38))||f.walls.some(w=>segmentDistance(x,y,w.a,w.b)<.41)||b.stairs.some(s=>circlePolygon(x,y,.1,l11StairRect(s)))||obstacles.some(p=>circlePolygon(x,y,.28,p)))continue
        valid[i]=1
      }
      let root=-1,dist=Infinity
      for(let i=0;i<valid.length;i++)if(valid[i]){const [x,y]=pt(i),d=Math.hypot(x-b.doorLocal[0],y-b.doorLocal[1]);if(d<dist){root=i;dist=d}}
      assert(root>=0,`${b.id} clear lobby`)
      const queue=[root];seen[root]=1
      for(let head=0;head<queue.length;head++){const i=queue[head],x=i%nx,y=Math.floor(i/nx);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*nx+xx;if(xx>=0&&xx<nx&&yy>=0&&yy<ny&&valid[j]&&!seen[j]){seen[j]=1;queue.push(j)}}}
      for(const room of f.rooms){
        const reachable=queue.some(i=>{const [x,y]=pt(i);return x>room.x+.4&&x<room.x+room.w-.4&&y>room.y+.4&&y<room.y+room.h-.4})
        if(!reachable)report.failures.push({building:b.id,archetype:b.archetype,floor:f.floor,room,doors:f.doors.filter(d=>d.from===room.id||d.to===room.id)})
      }
    }
  }
}
for(const spec of L11_BUILDINGS)assert(Object.keys(report.byArchetype).some(k=>k.endsWith(':'+spec.id)),`${spec.id} sampled`)
mkdirSync('reports/l11-urban',{recursive:true});writeFileSync('reports/l11-urban/layout-check.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,byArchetype:undefined,missingFurniture:report.missingFurniture.length,failures:report.failures.length},null,2));assert.equal(report.failures.length,0,'all rooms reachable with furniture and body clearance');assert.equal(report.missingFurniture.length,0,'every functional room has its essential furniture')
