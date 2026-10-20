import {l11CityPlan,l11World} from '../src/game/world/l11Layout'
import {L11_REFERENCE_SEED} from '../src/game/world/l11ReferenceDistrict'
import {l11QuayPlanting} from '../src/game/world/l11QuayPlanting'
import {l11TerrainHeight} from '../src/game/world/l11Hydrology'
import {l11PropColliders} from '../src/game/world/l11Collision'
import {l11SolidSurface} from '../src/game/world/l11Solid'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {updateMovement} from '../src/game/engine/movement'
import type {Structure} from '../src/game/core/types'

/** Production movement/collision, using generated props and building beds. */
export async function verifyL11ReferenceGreenery(qa:any){
  const e=qa.eng,check=(v:unknown,message:string)=>{if(!v)throw Error(message)}
  const place=(x:number,y:number,z:number)=>{qa.moveTo(x,y);Object.assign(e.player,{z,vz:0,floor:0,crouching:false});e.input.mx=e.input.my=0;e.input.jump=false;e.input.sprint=false;e.moveIt.acc=0;e.onStairs=false;e.submerged=false}
  const falls:unknown[]=[],probes:unknown[]=[]
  const fall=(height:number,label:string)=>{
    for(let i=0;i<240;i++)updateMovement(e,1/60,{dmg:1,drain:1},false)
    check(Math.abs(e.player.z-height)<.065,`${label}: expected top ${height}, landed at ${e.player.z}`)
    falls.push({label,expected:height,actual:e.player.z})
  }
  place(260.7,386,0);await qa.warm()
  const tree=(e.map.structures as Structure[]).find(s=>s.kind==='l11_plane_tree'&&Math.hypot(s.x+s.w/2+e.map.inf.ox-260.7,s.y+s.h/2+e.map.inf.oy-386)<.1)
  check(tree,'Generated avenue tree missing')
  const cx=tree!.x+tree!.w/2,cy=tree!.y+tree!.h/2,x=cx+e.map.inf.ox,y=cy+e.map.inf.oy,ground=l11TerrainHeight(L11_REFERENCE_SEED,x,y)
  check(!canOccupy(e.map,cx,cy,PLAYER_RADIUS,{z:ground,band:0}),'Tree trunk has no body collision')
  for(const [dx,dy]of [[.75,0],[-.75,0],[0,.75],[0,-.75]])check(canOccupy(e.map,cx+dx,cy+dy,.08,{z:ground+.05,band:0}),'Tree creates an air wall outside its trunk')
  const top=Math.max(...l11PropColliders(tree!).map(c=>l11SolidSurface(c,cx,cy,PLAYER_RADIUS)))+ground
  check(top>2&&top<5.2,'Branch surface must come from its actual mesh')
  place(x,y,top+1);await qa.warm();fall(top,'tree branch')
  probes.push({kind:'tree',id:tree!.data?.instanceId,world:[x,y],trunkBlocks:true,surroundingsClear:true})
  const b=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:quay-east-near'))!
  for(const [index,p]of l11QuayPlanting(b).entries()){
    // Choose the exposed cap, clear of the building; non-solid leaves above
    // it must not suspend the player at their visible crown height.
    const px=p.x-p.w/2+.1,pz=p.z,[wx,wy]=l11World(b,px,pz),cap=b.base+p.bottom+.67
    place(wx,wy,cap+1.2);await qa.warm()
    const lx=wx-e.map.inf.ox,ly=wy-e.map.inf.oy
    check(!canOccupy(e.map,lx,ly,.05,{z:cap-.2,band:0}),'Planter wall is missing collision')
    check(canOccupy(e.map,lx,ly,.05,{z:cap+.06,band:0}),'Foliage creates a solid wall above the cap')
    fall(cap,`quay planter ${index}`);probes.push({kind:'planter',world:[wx,wy],wallBlocks:true,leavesNonSolid:true})
  }
  return {ok:true,probes,falls}
}
