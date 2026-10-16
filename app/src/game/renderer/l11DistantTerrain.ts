import * as THREE from 'three'
import { l11CityPlan,l11TerrainHeight } from '../world/l11Layout'
import { clipping,rectangle,strip,transform,type Polygon,type MultiPolygon } from '../world/l11Geometry'
import { L11_CANAL_BED,L11_BRIDGE_TOP_LIFT,l11StreetHeight,l11BridgeSurfaceParts,l11BridgePiers } from '../world/l11Hydrology'
import { L11_ROAD_SURFACE_LIFT } from '../world/l11Dressing'
import { CityBatch } from './l11Batch'
import { l11Material } from './l11Materials'
import { l11CanalWaterJob } from './l11Water'
import { l11BridgeRailPlacements } from '../world/l11BridgeRails'
import { l11PropParts } from '../content/l11PropParts'
import { l11PropGeometry } from './l11PropGeometry'
import { l11CrossingPositions,l11YellowCrossing } from '../world/l11RoadMarkings'
import { l11QuayRailPlacements } from '../world/l11QuayRails'
import { addL11BridgeSkin } from './l11BridgeSkin'

/** Continue the actual street/canal topology beyond the live physics window.
 * Geometry is cut at that exact window, so it cannot double the near surface. */
export function* addL11DistantTerrain(group:THREE.Group,seed:number,ox:number,oy:number,realWater:boolean):Generator<void,void,unknown>{
  const outer=rectangle(ox-360,oy-360,880,880),live=rectangle(ox,oy,160,160),a=new CityBatch(),water:Polygon[]=[]
  const yard=l11Material('concrete','#8d918b'),asphalt=l11Material('asphalt','#cad0d0'),paving=l11Material('paving','#e1ddcf'),stone=l11Material('concrete','#a8aba5')
  const white=l11Material('paint','#eee9d6'),yellow=l11Material('paint','#d6b868')
  const height=(x:number,y:number)=>l11TerrainHeight(seed,x,y)
  const addRail=(x:number,y:number,angle:number,h:number,grade:number,kind='canal_railing')=>{
    const root=new THREE.Matrix4().compose(new THREE.Vector3(x-ox,h,y-oy),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-angle),new THREE.Vector3(1,1,1))
    root.multiply(new THREE.Matrix4().set(1,0,0,0,grade,1,0,0,0,0,1,0,0,0,0,1))
    for(const part of l11PropParts('l11_'+kind)){const built=l11PropGeometry(part);const mat=l11Material(part.surface==='wood'?'propwood':part.surface,part.color);a.geometry(mat,built.geometry,built.matrix.clone().premultiply(root),built.uv)}
  }
  for(let my=Math.floor((oy-376)/1024);my<=Math.floor((oy+504)/1024);my++)for(let mx=Math.floor((ox-376)/1024);mx<=Math.floor((ox+504)/1024);mx++){
    const plan=l11CityPlan(seed,mx,my),b=plan.bounds,region=clipping.difference(clipping.intersection(outer,rectangle(b.x,b.y,b.w,b.h)),live)
    if(!region.length)continue
    const clip=(p:Polygon|MultiPolygon)=>clipping.intersection(p,region).flatMap(p=>l11BridgeSurfaceParts(p,plan.bridges)),waters=plan.canals.flatMap(c=>c.water),street=(x:number,y:number)=>l11StreetHeight(plan,x,y)
    for(const p of waters.length?clipping.difference(region,...waters):region)a.surface(yard,p,height,ox,oy)
    yield
    for(const canal of plan.canals){
      for(const p of clip(canal.water)){water.push(p);a.surface(stone,p,L11_CANAL_BED,ox,oy)}
      for(const p of clip(clipping.difference(canal.banks,...canal.water)))a.surface(paving,p,(x,y)=>height(x,y)+.022,ox,oy)
      yield
      for(const ring of canal.water.flat())for(let i=1;i<ring.length;i++){
        const p=ring[i-1],q=ring[i];if(Math.abs(q[1]-p[1])<.001)continue
        for(const edge of clip(strip(p,q,.3)))a.prism(stone,transform(edge,-ox,-oy,0),L11_CANAL_BED,.12)
        yield
      }
      let rails=0
      for(const rail of l11QuayRailPlacements(seed,canal,plan.roads,oy-360,oy+520)){
        if(Math.hypot(rail.x-ox-80,rail.y-oy-80)>350||(rail.x>=ox&&rail.x<ox+160&&rail.y>=oy&&rail.y<oy+160))continue
        addRail(rail.x,rail.y,rail.angle,height(rail.x,rail.y),rail.grade,rail.kind)
        // One canal can own hundreds of detailed rail sections. Keep the
        // generator's time budget effective within that canal, not after it.
        if(++rails%4===0)yield
      }
    }
    for(const bridge of plan.bridges)for(const p of clip(bridge.polygon)){
      const local=transform(p,-ox,-oy,0)
      addL11BridgeSkin(a,[p],plan,ox,oy,true)
      a.surface(stone,local,(x,y)=>street(x+ox,y+oy)+L11_BRIDGE_TOP_LIFT)
      yield
    }
    for(const bridge of plan.bridges)for(const p of l11BridgePiers(seed,bridge)){for(const poly of clip(p.polygon))a.prism(stone,transform(poly,-ox,-oy,0),p.bottom,p.top);yield}
    for(const road of plan.roads){
      const motorRoads=plan.roads.filter(r=>r.id!==road.id&&!r.pedestrian).map(r=>r.polygon)
      const roadParts=(poly:Polygon|import('../world/l11Geometry').MultiPolygon)=>road.pedestrian&&motorRoads.length?clipping.difference(poly,...motorRoads):[poly]
      for(let i=1;i<road.points.length;i++)for(const raw of roadParts(strip(road.points[i-1],road.points[i],road.width+6)))for(const p of clip(raw))a.surface(paving,p,(x,y)=>street(x,y)+.03,ox,oy)
      for(const raw of roadParts(road.polygon))for(const p of clip(raw))a.surface(road.pedestrian?paving:asphalt,p,(x,y)=>street(x,y)+L11_ROAD_SURFACE_LIFT,ox,oy)
      // Match the near road graph: crossroads remain marked beyond the live
      // collision window, rather than popping into view at a chunk boundary.
      for(let si=1;si<road.points.length;si++){
        const p=road.points[si-1],q=road.points[si],len=Math.hypot(q[0]-p[0],q[1]-p[1]),dx=(q[0]-p[0])/len,dy=(q[1]-p[1])/len
        const crossings=l11CrossingPositions(road,si,plan.roads),gold=l11YellowCrossing(seed,road),at=(t:number,off=0):[number,number]=>[p[0]+dx*t-dy*off,p[1]+dy*t+dx*off]
        if(!road.pedestrian)for(const t of crossings){
          for(let off=-road.width/2+.7;off<road.width/2-.5;off+=1)for(const poly of clip(strip(at(t-1.4,off),at(t+1.4,off),gold?.18:.48)))a.surface(gold?yellow:white,poly,(x,y)=>street(x,y)+.063,ox,oy)
          if(gold)for(const edge of [-1.4,1.4])for(const poly of clip(strip(at(t+edge,-road.width/2+.4),at(t+edge,road.width/2-.4),.12)))a.surface(yellow,poly,(x,y)=>street(x,y)+.064,ox,oy)
        }
        if(!road.pedestrian&&road.class==='arterial'){
          const cuts=[...plan.roads.filter(r=>r.id!==road.id&&r.points.slice(1).some((b,j)=>{const a=r.points[j];return Math.abs(dx*(b[1]-a[1])-dy*(b[0]-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1])>.12})).flatMap(r=>r.polygon),...crossings.map(t=>strip(at(t-2),at(t+2),road.width))]
          for(const off of [-.13,.13])for(const poly of clip(strip(at(0,off),at(len,off),.1)))for(const part of cuts.length?clipping.difference(poly,...cuts):[poly])a.surface(yellow,part,(x,y)=>street(x,y)+.06,ox,oy)
        }
        yield
      }
      let rails=0
      for(let si=1;si<road.points.length;si++)for(const rail of l11BridgeRailPlacements(seed,road,si,2,Math.hypot(road.points[si][0]-road.points[si-1][0],road.points[si][1]-road.points[si-1][1]),plan)){
        if(Math.hypot(rail.x-ox-80,rail.y-oy-80)>350|| (rail.x>=ox&&rail.x<ox+160&&rail.y>=oy&&rail.y<oy+160))continue
        addRail(rail.x,rail.y,rail.angle,street(rail.x,rail.y),rail.grade)
        if(++rails%4===0)yield
      }
      yield
    }
  }
  a.finish(group)
  const surface=yield* l11CanalWaterJob(water,ox,oy,realWater,8)
  if(surface){surface.name='l11-distant-canal-water';group.add(surface)}
}
