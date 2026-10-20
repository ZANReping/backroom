import { l11CityPlan,l11World,l11Local } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { l11VerticalSignMount } from '../src/game/world/l11VerticalSignMounts'
import { l11Shopfront } from '../src/game/world/l11Shopfront'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'
import { L11_REFERENCE_SEED,L11_REFERENCE_LOTS,L11_REFERENCE_VERSION } from '../src/game/world/l11ReferenceDistrict'
import { l11StreetHeight,l11BridgePiers,l11TerrainHeight,L11_CANAL_BED } from '../src/game/world/l11Hydrology'
import { l11QuayWing } from '../src/game/world/l11QuayWing'
import { l11QuayRailPlacements } from '../src/game/world/l11QuayRails'
import { l11RetailPiers } from '../src/game/world/l11RetailFacade'

const check=(v:unknown,message:string)=>{if(!v)throw Error(message)}
const poses=[
  {id:'01-office-street',x:272,y:415,z:0,tx:270,ty:220,th:12,fov:42,reference:'11iconic.jpg'},
  {id:'02-brick-apartments',x:108,y:535,z:0,tx:122,ty:582,th:10,fov:50,reference:'11scenes.jpg'},
  {id:'03-canal',x:760,y:967.8,z:0,tx:760,ty:780,th:12,fov:56,reference:'11canal.png'},
  {id:'04-office-reverse',x:272,y:284,z:0,tx:272,ty:392,th:13,fov:75},
  {id:'05-office-rear',x:181,y:366,z:0,tx:223,ty:340,th:12,fov:75},
  {id:'06-apartment-rear',x:129,y:637,z:0,tx:120,ty:590,th:7,fov:80},
  {id:'07-canal-quay',x:720,y:881,z:0,tx:820,ty:856,th:17,fov:75},
  {id:'08-canal-reverse',x:760,y:816,z:0,tx:760,ty:930,th:17,fov:75},
  {id:'09-office-interior',building:'west-piers'},
  {id:'10-apartment-interior',building:'brick-housing'},
  {id:'11-apartment-upper',building:'brick-housing',floor:1},
  {id:'12-apartment-living-reverse',building:'brick-housing',floor:1,reverse:true},
  {id:'14-storefront-corner',x:264,y:392,z:0,tx:250,ty:378,th:1.7,fov:64,reference:'11iconic.jpg'},
  {id:'15-storefront-interior',building:'west-piers',shop:true},
  {id:'16-twin-courtyard',x:793,y:900,z:0,tx:843,ty:894,th:45,fov:78,reference:'11canal.png'},
  {id:'17-arch-side',x:733,y:834,z:0,tx:763,ty:816,th:.15,fov:68,reference:'11canal.png'},
  {id:'18-blue-shops',x:116,y:643,z:0,tx:123,ty:667,th:3.3,fov:75,reference:'11lowdensity.jpg'},
  {id:'19-blue-shops-rear',x:158,y:701,z:0,tx:125,ty:676,th:6,fov:80},
  {id:'20-service-workshop',building:'service-loft',workshop:true,reference:'11unfinishedinterior.jpg'},
  {id:'21-service-upper',building:'service-loft',floor:1,workshop:true,reverse:true},
  {id:'22-grand-entrance',x:277,y:391,z:0,tx:292,ty:367,th:3.2,fov:72,reference:'11iconic.jpg'},
  {id:'23-entrance-gardens',x:284,y:367,z:0,tx:298,ty:367,th:2.5,fov:100,reference:'11iconic.jpg'},
  {id:'24-glazed-office',building:'east-stone'},
  {id:'25-stone-advert',x:278,y:283,z:0,tx:300,ty:314,th:18,fov:70,reference:'11iconic.jpg'},
  {id:'26-glazed-rear',x:362,y:376,z:0,tx:337,ty:362,th:12,fov:72},
  {id:'27-glazed-upper',building:'east-stone',floor:1,reverse:true},
  {id:'28-stone-side',x:359,y:324,z:0,tx:335,ty:317,th:12,fov:72},
  {id:'29-banner-reading',x:278,y:343,z:0,tx:287,ty:334,th:17,fov:65,reference:'11iconic.jpg'},
  {id:'30-shop-looking-out',building:'west-piers',shop:true,reverse:true,reference:'11iconic.jpg'},
  {id:'31-roof-link-oblique',x:795,y:868,z:0,tx:812,ty:894,th:62,fov:64,reference:'11canal.png'},
  {id:'32-waterside-steps',x:790,y:911,z:0,tx:807,ty:894.3,th:2.3,fov:72,reference:'11canal.png'},
  {id:'33-shop-blade-reverse',x:263,y:380,z:0,tx:257,ty:386.5,th:2.6,fov:72,reference:'11iconic.jpg'},
  {id:'34-quay-service-side',x:737,y:880,z:0,tx:713,ty:848,th:14,fov:68,reference:'11canal.png'},
  {id:'35-quay-balcony-front',x:738,y:825,z:0,tx:710,ty:852,th:16,fov:72,reference:'11canal.png'},
  {id:'36-green-mullions',x:720,y:931,z:0,tx:701,ty:916,th:17,fov:70,reference:'11canal.png'},
  {id:'37-quay-annex-interior',building:'quay-west-annex',reference:'11canal.png'},
  {id:'38-quay-annex-rear',x:659,y:850,z:0,tx:669,ty:846,th:13,fov:75,reference:'11canal.png'},
  {id:'40-stone-quay-rail',x:786,y:882,z:0,tx:780.35,ty:891,th:1.1,fov:68,reference:'11canal.png'},
  {id:'41-green-bridge',x:733,y:837,z:0,tx:761,ty:816,th:.4,fov:56,reference:'11canal.png'},
  {id:'42-bridge-under',x:760,y:828,z:-2,tx:760,ty:816,th:.65,fov:80,reference:'11canal.png'},
  {id:'43-garden-street-side',x:279,y:387,z:0,tx:287,ty:382,th:1.15,fov:70,reference:'11iconic.jpg'},
  {id:'44-quay-planting',x:800,y:863,z:0,tx:807,ty:859,th:1.2,fov:72,reference:'11canal.png'},
  {id:'45-shop-checkout',x:252,y:378,z:0,tx:254.8,ty:379,th:1.15,fov:72,reference:'11iconic.jpg'},
  {id:'46-shop-refrigerators',x:248,y:382,z:0,tx:245.5,ty:379.5,th:1.3,fov:75,reference:'11iconic.jpg'},
  {id:'47-roof-link-upper-reverse',x:823,y:894,z:78,tx:808,ty:894,th:66,fov:84,reference:'11canal.png'},
]
export function attachL11Reference(qa:any){
  const eng=qa.eng,r=qa.r;let baseline=false
  const position=(x:number,y:number,z:number)=>{qa.moveTo(x,y);eng.player.z=z;eng.player.floor=0;eng.player.vz=0;eng.player.crouching=false;eng.input.mx=eng.input.my=0;eng.submerged=false;eng.moveIt.acc=0;eng.onStairs=false}
  const walkShop=async(b:ReturnType<typeof l11CityPlan>['buildings'][number])=>{
    const shop=l11Shopfront(b);if(!shop?.available)return {available:false}
    const nx=shop.side==='e'?1:shop.side==='w'?-1:0,ny=shop.side==='s'?1:shop.side==='n'?-1:0
    const start=l11World(b,shop.door[0]+nx*1.3,shop.door[1]+ny*1.3),end=l11World(b,shop.door[0]-nx*1.3,shop.door[1]-ny*1.3),walks=[]
    position(...start,b.base);await qa.warm()
    for(const target of [end,start]){
      for(let i=0;i<240;i++){
        const x=eng.player.x+eng.map.inf.ox,y=eng.player.y+eng.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y);if(d<.05)break
        eng.input.mx=(target[0]-x)/d;eng.input.my=(target[1]-y)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
      }
      eng.input.mx=eng.input.my=0
      const error=Math.hypot(eng.player.x+eng.map.inf.ox-target[0],eng.player.y+eng.map.inf.oy-target[1]);check(error<.12,'Corner shop street door blocked: '+b.id+' '+error)
      walks.push({target,error})
    }
    const pier=l11RetailPiers(b).filter(p=>shop.side==='e'?p.x>b.width:shop.side==='w'?p.x<0:shop.side==='s'?p.z>b.depth:p.z<0).sort((a,c)=>Math.hypot(a.x-shop.door[0],a.z-shop.door[1])-Math.hypot(c.x-shop.door[0],c.z-shop.door[1]))[0]
    check(pier,'Shop has no ground support on its street facade')
    const probe=(out:number)=>{const p=l11World(b,pier.x+nx*out,pier.z+ny*out);return canOccupy(eng.map,p[0]-eng.map.inf.ox,p[1]-eng.map.inf.oy,.02,{z:b.base+.1,band:0})}
    check(!probe(.30),'Shop pier has no collision outside the glazing plane')
    check(probe(.52),'Shop pier collision extends into the pavement beyond the model')
    return {available:true,building:b.id,side:shop.side,returnSide:shop.back,door:shop.door,walks,pier:{...pier,outerFaceBlocked:true,pavementClear:true}}
  }
  qa.reference={
    inspection:async()=>walkShop(l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:west-piers'))!),
    setup:async(options:{baseline:boolean;low:boolean})=>{
      baseline=options.baseline;await qa.scene(11,'open',L11_REFERENCE_SEED)
      qa.hide();r.setTextureQuality(options.low?0:2);r.setDetailDistance(options.low?.55:1);r.setSceneLightLimit(options.low?8:16);r.setLightShadows(options.low?0:2);r.setShadows(!options.low);r.setSunShadows(!options.low);r.setBloomFx(false);r.setRealWater(!options.low)
      Object.assign(eng.l11Weather,{kind:'calm',k:0,wetness:0,t:120});eng.player.flashlight=false;eng.dev.frozenAI=true;qa.freezeRenderTime(10)
      return {seed:L11_REFERENCE_SEED,newGameSeed:L11_REFERENCE_SEED-1441,version:L11_REFERENCE_VERSION,buildings:L11_REFERENCE_LOTS.length,viewport:[1920,1080],low:options.low,baseline,weather:'calm',time:10,shadows:!options.low}
    },
    cases:()=>baseline?poses.slice(0,3):poses,
    civil:async()=>{
      const plan=l11CityPlan(L11_REFERENCE_SEED,0,0),walks=[]
      const crossing=plan.bridges.find(b=>b.roadId.endsWith(':quay-crossing:816'))!;check(crossing,'Missing arch crossing')
      for(const [start,end]of [[724,800],[800,724]]){
        position(start,816,l11StreetHeight(plan,start,816));await qa.warm();const heights=[]
        for(let i=0;i<1700;i++){
          const x=eng.player.x+eng.map.inf.ox;if(Math.abs(end-x)<.09)break
          eng.input.mx=Math.sign(end-x);eng.input.my=0;updateMovement(eng,1/60,{dmg:1,drain:1},false)
          if(i%40===0)heights.push({x:eng.player.x+eng.map.inf.ox,z:eng.player.z})
        }
        eng.input.mx=eng.input.my=0;const error=Math.abs(eng.player.x+eng.map.inf.ox-end)
        check(error<.15,'Arch crossing obstructed: '+error);check(Math.max(...heights.map(p=>p.z))-Math.min(...heights.map(p=>p.z))>.7,'Bridge remained flat')
        walks.push({start,end,error,heights})
      }
      position(760,816,L11_CANAL_BED);await qa.warm()
      check(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:L11_CANAL_BED,band:0}),'Clear water span below bridge is blocked')
      const piers=l11BridgePiers(L11_REFERENCE_SEED,crossing)
      for(const pier of piers){const ring=pier.polygon[0].slice(0,-1),x=ring.reduce((s,p)=>s+p[0]/ring.length,0),y=ring.reduce((s,p)=>s+p[1]/ring.length,0);position(x,y,L11_CANAL_BED)
        check(!canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:L11_CANAL_BED,band:0}),'Pier has no underwater collision')
      }
      const promenades=[]
      for(const x of [726,794])for(const [start,end]of [[838,905],[905,838]]){
        position(x,start,l11StreetHeight(plan,x,start));await qa.warm()
        for(let i=0;i<1600;i++){
          const y=eng.player.y+eng.map.inf.oy;if(Math.abs(end-y)<.08)break
          eng.input.mx=0;eng.input.my=Math.sign(end-y);updateMovement(eng,1/60,{dmg:1,drain:1},false)
        }
        eng.input.mx=eng.input.my=0;const error=Math.hypot(eng.player.x+eng.map.inf.ox-x,eng.player.y+eng.map.inf.oy-end)
        check(error<.15,'Pedestrian quay blocked: '+JSON.stringify({x,start,end,error}));promenades.push({x,start,end,error})
      }
      const railX=780.35,railY=884,railGround=l11TerrainHeight(L11_REFERENCE_SEED,railX,railY)
      position(railX,railY,railGround+2);await qa.warm()
      check(!canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:railGround+.1,band:0}),'Stone quay pier has no side collision')
      check(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:railGround+1.15,band:0}),'Air above quay cap is blocked')
      for(let i=0;i<180;i++)updateMovement(eng,1/60,{dmg:1,drain:1},false)
      const quayCap={x:railX,y:railY,height:eng.player.z-railGround}
      check(Math.abs(quayCap.height-1.1)<.06,'Falling onto quay cap failed: '+quayCap.height)
      const b=plan.buildings.find(b=>b.id.endsWith(':reference:quay-west-annex'))!,q=l11QuayWing(b.width,b.depth,b.front),lane=(q.projection-.5)/2,near=q.wing+.2+q.stair-.425,far=q.wing+.625
      const stops=[[near,.18+lane/2,0],[far,.18+lane/2,1.5],[far,.18+lane*1.5,1.5],[near,.18+lane*1.5,3]].map(([u,v,z])=>[...l11World(b,...q.point(u,v)),b.base+z])
      position(stops[0][0],stops[0][1],stops[0][2]);await qa.warm();const externalStairs=[]
      for(const target of [...stops.slice(1),...stops.slice(0,-1).reverse()]){
        for(let i=0;i<420;i++){
          const x=eng.player.x+eng.map.inf.ox,y=eng.player.y+eng.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y);if(d<.06)break
          eng.input.mx=(target[0]-x)/d;eng.input.my=(target[1]-y)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
        }
        eng.input.mx=eng.input.my=0
        const error=Math.hypot(eng.player.x+eng.map.inf.ox-target[0],eng.player.y+eng.map.inf.oy-target[1]),height=eng.player.z
        check(error<.15&&Math.abs(height-target[2])<.16,'Exterior stair blocked: '+JSON.stringify({target,error,height}));externalStairs.push({target,error,height})
      }
      return {ok:true,walks,piers:piers.length,promenades,quayCap,externalStairs}
    },
    randomCases:()=>['retail','twins','garden','wall-sign','blade-sign','glazed-terrace','quay-service-wing','green-curtain','stone-quay'],
    random:async(kind:string)=>{
      const seed=42;if(eng.map.inf.seed!==seed){await qa.scene(11,'open',seed);Object.assign(eng.l11Weather,{kind:'calm',k:0,wetness:0,t:120})}
      if(kind==='stone-quay'){
        for(const mx of [-1,0,1]){
          const plan=l11CityPlan(seed,mx,0)
          for(const c of plan.canals.filter(c=>c.pedestrian))for(const rail of l11QuayRailPlacements(seed,c,plan.roads,400,800)){
            const x=rail.x+rail.side*3,y=rail.y-3;position(x,y,l11TerrainHeight(seed,x,y))
            if(!canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:0}))continue
            const tx=rail.x,ty=rail.y+8,th=l11TerrainHeight(seed,tx,ty)+.9
            qa.look.yaw=Math.atan2(x-tx,y-ty);qa.look.pitch=Math.atan2(th-eng.player.z-1.55,Math.hypot(tx-x,ty-y));r.setFov(72,35);await qa.warm();qa.freezeRenderTime(10);r.eyeMeterAt=-1;await new Promise(resolve=>setTimeout(resolve,2000))
            check(!canOccupy(eng.map,rail.x-eng.map.inf.ox,rail.y-eng.map.inf.oy,.32,{z:l11TerrainHeight(seed,rail.x,rail.y)+.1,band:0}),'Ordinary quay stone pier has no collision')
            return {kind,seed,id:rail.id,rail:rail.kind,validation:{ok:true},world:[x,y,eng.player.z],target:[tx,ty,th],stats:qa.stats()}
          }
        }
        throw Error('No ordinary stone quay viewpoint')
      }
      const candidates=[...l11CityPlan(seed,0,0).buildings,...l11CityPlan(seed,-1,-1).buildings]
      const b=candidates.find(b=>kind==='retail'?b.architecture==='pier-retail'&&l11Shopfront(b)?.available:kind==='twins'?b.architecture==='ribbon-twins'&&!!b.entrance&&!b.sealed:kind==='garden'?b.entrance?.gardens:kind==='glazed-terrace'?b.architecture==='glazed-terrace'&&!!b.entrance&&!b.sealed:kind==='quay-service-wing'?b.architecture==='quay-service-wing'&&!b.sealed:kind==='green-curtain'?b.facadeProfile==='green-curtain'&&!b.sealed:kind==='wall-sign'?b.verticalSign?.mount==='flush':b.verticalSign?.mount==='blade'&&(l11VerticalSignMount(b)?.y??Infinity)<20)!
      check(b,'No ordinary-world '+kind)
      const validation=['garden','glazed-terrace','twins','quay-service-wing','green-curtain'].includes(kind)?await qa.reference.validate(b.id):kind==='retail'?await walkShop(b):undefined,sign=kind.endsWith('sign')?l11VerticalSignMount(b):null
      const anchor=sign?l11World(b,sign.x,sign.z):b.door,nx=sign?Math.sin(sign.angle-b.angle):Math.sin(b.doorAngle),ny=sign?Math.cos(sign.angle-b.angle):-Math.cos(b.doorAngle)
      const wallX=sign?sign.nx*Math.cos(b.angle)-sign.nz*Math.sin(b.angle):nx,wallY=sign?sign.nx*Math.sin(b.angle)+sign.nz*Math.cos(b.angle):ny;let x=0,y=0,ok=false
      // A projecting board faces along the wall. View it obliquely from the
      // pavement, outside its lower podium, instead of standing in the podium.
      for(const side of sign?.blade?[1,-1]:[1]){for(const distance of [12,8,18,26,38,5]){x=anchor[0]+(sign?.blade?nx*.8*side+wallX*.6:nx)*distance;y=anchor[1]+(sign?.blade?ny*.8*side+wallY*.6:ny)*distance;const plan=l11CityPlan(seed,Math.floor((x-16)/1024),Math.floor((y-16)/1024));position(x,y,l11StreetHeight(plan,x,y));if(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:0})){ok=true;break}}if(ok)break}
      check(ok,'No clear ordinary-world viewpoint '+kind)
      const link=kind==='twins'?b.volumes.find(v=>v.soffit):undefined,centre=link?l11World(b,link.x+link.w/2,link.y+link.d/2):l11World(b,b.width/2,b.depth/2)
      const tx=sign?anchor[0]:centre[0],ty=sign?anchor[1]:centre[1],th=sign?b.base+sign.y:kind==='retail'||kind==='garden'?2.5:link?b.base+link.lo*.55:b.floors*1.15
      qa.look.yaw=Math.atan2(x-tx,y-ty);qa.look.pitch=Math.atan2(th-eng.player.z-1.55,Math.hypot(tx-x,ty-y));r.setFov(85,35);await qa.warm();qa.freezeRenderTime(10);r.eyeMeterAt=-1;await new Promise(resolve=>setTimeout(resolve,2000))
      return {kind,seed,id:b.id,recipe:b.sourceRecipe,architecture:b.architecture,entrance:b.entrance,sign:b.verticalSign,validation,world:[x,y,eng.player.z],target:[tx,ty,th],stats:qa.stats()}
    },
    view:async(id:string)=>{
      const pose=poses.find(p=>p.id===id)!;check(pose,'Unknown reference case')
      let x=pose.x??0,y=pose.y??0,z=pose.z??0,tx=pose.tx??0,ty=pose.ty??0,th=pose.th??0,room
      if(pose.building){
        const b=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:'+pose.building))!;check(b,'Missing district building '+pose.building)
        const f=pose.floor??0,plan=l11InteriorPlan(b).floors[f]
        const fixtures=l11RoomFixtures(b),roomCandidates=plan.rooms.filter(p=>pose.shop?p.kind==='shop':pose.workshop?p.kind==='workshop':pose.building==='brick-housing'?p.kind==='living':p.kind==='workspace')
        if(pose.shop||pose.workshop)roomCandidates.sort((a,c)=>fixtures.filter(p=>p.roomId===c.id).length-fixtures.filter(p=>p.roomId===a.id).length)
        const corner=pose.shop?l11Shopfront(b):undefined
        if(corner?.available)roomCandidates.sort((a,c)=>Number(Math.abs(c.x-corner.x)<.01&&Math.abs(c.y-corner.y)<.01)-Number(Math.abs(a.x-corner.x)<.01&&Math.abs(a.y-corner.y)<.01))
        room=roomCandidates[0]??plan.rooms[0];check(room,'No inhabitable room')
        ;[x,y]=l11World(b,room.x+room.w*.5,room.y+room.h*.5);[tx,ty]=l11World(b,room.x+room.w*(pose.reverse?.25:.5),room.y+(pose.reverse?room.h:0));z=b.base+f*3;th=z+1.6
        if(pose.shop&&pose.reverse&&corner){[tx,ty]=l11World(b,corner.corner[0]+(corner.east?2:-2),corner.corner[1]+(corner.south?2:-2))}
        position(x,y,z);eng.player.floor=f
        if((pose.shop||pose.workshop)&&!pose.reverse){
          const door=plan.doors.find(d=>d.from===room.id||d.to===room.id)!
          ;[x,y]=l11World(b,...door.center);position(x,y,z);eng.player.floor=f
          ;[tx,ty]=l11World(b,room.x+room.w*.5,room.y+room.h*.5)
        }
        if(pose.workshop&&pose.reverse){
          const door=plan.doors.find(d=>d.from===room.id||d.to===room.id)!,candidates=[.17,.5,.83].flatMap(u=>[.17,.5,.83].map(v=>[room!.x+room!.w*u,room!.y+room!.h*v] as const))
          candidates.sort((a,c)=>Math.hypot(c[0]-door.center[0],c[1]-door.center[1])-Math.hypot(a[0]-door.center[0],a[1]-door.center[1]))
          for(const p of candidates){[x,y]=l11World(b,...p);position(x,y,z);eng.player.floor=f;if(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z,band:f}))break}
          ;[tx,ty]=l11World(b,...door.center)
        }
        // Furnished room centres are not guaranteed clear; choose a clear
        // position on a real route near its open door when necessary.
        if(!canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z,band:f})){
          const door=plan.doors.find(d=>d.from===room.id||d.to===room.id)!
          ;[x,y]=l11World(b,...door.center);position(x,y,z);eng.player.floor=f
          ;[tx,ty]=l11World(b,room.x+room.w*.5,room.y+room.h*.5)
        }
      }else position(x,y,l11StreetHeight(l11CityPlan(L11_REFERENCE_SEED,Math.floor((x-16)/1024),Math.floor((y-16)/1024)),x,y)+z)
      const eye=eng.player.z+1.55;qa.look.yaw=Math.atan2(x-tx,y-ty);qa.look.pitch=Math.atan2(th-eye,Math.hypot(tx-x,ty-y));qa.look.roll=0;r.setFov(pose.fov??78,35)
      await qa.warm();qa.freezeRenderTime(10)
      // Frozen visual time must not freeze a daylight meter sampled before the
      // outdoor blend settled. Re-meter the finished scene and let eyes adapt.
      r.eyeMeterAt=-1;await new Promise(resolve=>setTimeout(resolve,2500))
      check(baseline||canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:eng.player.floor}),id+' camera is inside solid geometry')
      return {id,world:[x,y,eng.player.z],target:[tx,ty,th],yaw:qa.look.yaw,pitch:qa.look.pitch,fov:pose.fov??78,room:room?.kind,lighting:{exposure:r.three.toneMappingExposure,meter:r.eyeMeter,outdoor:r.outK,fogNear:r.scene.fog?.near,fogFar:r.scene.fog?.far,sun:r.sunDir.intensity,msaa:r.composer?.renderTarget1.samples??0,buffer:[r.three.domElement.width,r.three.domElement.height]},stats:qa.stats()}
    },
    validationCases:()=>l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.filter(b=>b.id.includes(':reference:')).map(b=>b.id),
    validate:async(id:string)=>{
      const seed=eng.map.inf.seed,plan=l11CityPlan(seed,0,0),buildings=seed===L11_REFERENCE_SEED?plan.buildings.filter(b=>b.id.includes(':reference:')):[...plan.buildings,...l11CityPlan(seed,-1,-1).buildings],entrances=[]
      if(seed===L11_REFERENCE_SEED)check(buildings.length===L11_REFERENCE_LOTS.length,'Missing reference district building')
      const selected=buildings.filter(b=>b.id===id);check(selected.length===1,'Unknown validation building '+id)
      for(const b of selected){
        const nx=Math.sin(b.doorAngle),ny=-Math.cos(b.doorAngle),distance=(b.entrance?.run??0)+1.5,start=[b.door[0]+nx*distance,b.door[1]+ny*distance],end=[b.door[0]-nx*1.5,b.door[1]-ny*1.5]
        position(start[0],start[1],b.base-(b.entrance?.rise??0));await qa.warm()
        for(let i=0;i<600;i++){
          const wx=eng.player.x+eng.map.inf.ox,wy=eng.player.y+eng.map.inf.oy,d=Math.hypot(end[0]-wx,end[1]-wy)
          if(d<.09)break;eng.input.mx=(end[0]-wx)/d;eng.input.my=(end[1]-wy)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
        }
        eng.input.mx=eng.input.my=0
        const error=Math.hypot(eng.player.x+eng.map.inf.ox-end[0],eng.player.y+eng.map.inf.oy-end[1]);check(error<.15,'Entrance blocked '+b.id)
        if(b.entrance){
          check(Math.abs(eng.player.z-b.base)<.12,'Entrance stair ascent height '+b.id)
          for(let i=0;i<600;i++){
            const wx=eng.player.x+eng.map.inf.ox,wy=eng.player.y+eng.map.inf.oy,d=Math.hypot(start[0]-wx,start[1]-wy)
            if(d<.09)break;eng.input.mx=(start[0]-wx)/d;eng.input.my=(start[1]-wy)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
          }
          eng.input.mx=eng.input.my=0
          check(Math.hypot(eng.player.x+eng.map.inf.ox-start[0],eng.player.y+eng.map.inf.oy-start[1])<.15,'Entrance stair descent blocked '+b.id)
          check(Math.abs(eng.player.z-(b.base-b.entrance.rise))<.12,'Entrance stair descent height '+b.id)
        }
        const local=l11Local(b,eng.player.x+eng.map.inf.ox,eng.player.y+eng.map.inf.oy)
        const interior=l11InteriorPlan(b),flights=[]
        for(const s of b.stairs){
          const along=s.axis==='x',start=l11World(b,s.x+(along?-.6:s.width/2),s.y+(along?s.width/2:-.6)),end=l11World(b,s.x+(along?s.length+.6:s.width/2),s.y+(along?s.width/2:s.length+.6))
          position(start[0],start[1],b.base+s.flight*3);eng.player.floor=s.flight
          check(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:s.flight}),`Stair landing blocked ${b.id} flight ${s.flight}: ${JSON.stringify({start,stair:s})}`)
          for(let i=0;i<360;i++){
            const wx=eng.player.x+eng.map.inf.ox,wy=eng.player.y+eng.map.inf.oy,d=Math.hypot(end[0]-wx,end[1]-wy)
            if(d<.09)break;eng.input.mx=(end[0]-wx)/d;eng.input.my=(end[1]-wy)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
          }
          eng.input.mx=eng.input.my=0
          const error=Math.hypot(eng.player.x+eng.map.inf.ox-end[0],eng.player.y+eng.map.inf.oy-end[1]),height=eng.player.z-b.base
          check(error<.15&&Math.abs(height-(s.flight+1)*3)<.12,`Stair blocked ${b.id} flight ${s.flight}: error ${error}, height ${height}; local ${JSON.stringify(l11Local(b,eng.player.x+eng.map.inf.ox,eng.player.y+eng.map.inf.oy))}`)
          // Descend the very same flight, including its lower landing. A clear
          // upstairs camera position alone is not evidence of a usable stair.
          for(let i=0;i<360;i++){
            const wx=eng.player.x+eng.map.inf.ox,wy=eng.player.y+eng.map.inf.oy,d=Math.hypot(start[0]-wx,start[1]-wy)
            if(d<.09)break;eng.input.mx=(start[0]-wx)/d;eng.input.my=(start[1]-wy)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
          }
          eng.input.mx=eng.input.my=0
          const returnError=Math.hypot(eng.player.x+eng.map.inf.ox-start[0],eng.player.y+eng.map.inf.oy-start[1]),returnHeight=eng.player.z-b.base
          check(returnError<.15&&Math.abs(returnHeight-s.flight*3)<.12,`Stair descent blocked ${b.id} flight ${s.flight}: error ${returnError}, height ${returnHeight}`)
          flights.push({flight:s.flight,error,height,returnError,returnHeight})
        }
        let doorCount=0
        for(const f of interior.floors)for(const door of f.doors){
          const p=l11World(b,...door.center)
          // Long blocks can extend beyond the live 160m window when standing
          // at their opposite stair. Load the tested doorway's actual chunk.
          position(p[0],p[1],b.base+f.floor*3);eng.player.floor=f.floor
          check(canOccupy(eng.map,p[0]-eng.map.inf.ox,p[1]-eng.map.inf.oy,.32,{z:b.base+f.floor*3,band:f.floor}),`Room door blocked ${door.id}`);doorCount++
        }
        entrances.push({id:b.id,error,local,rooms:interior.floors.map(f=>f.rooms.length),doors:doorCount,flights})
      }
      return {ok:true,entrances}
    },
  }
}
