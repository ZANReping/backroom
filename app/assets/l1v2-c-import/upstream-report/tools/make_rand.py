import json,make_ref as M
helper="""(async()=>{const P=await import('/src/game/world/l1Plan.ts');const sh=await import('/src/game/renderer/shared.ts');
const put=(E,tx,ty)=>{const p=E.player,inf=E.map.inf;p.x=tx-inf.ox;p.y=ty-inf.oy;E.updateInfiniteWindow();const i2=E.map.inf;p.x=tx-i2.ox;p.y=ty-i2.oy;p.z=0;p.vz=0};
window.__rand=async(i,want)=>{const E=window.__engine,seed=E.map.inf.seed;let s=(i*2654435761+12345)>>>0;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
 let x,y,t;for(let k=0;k<4000;k++){x=Math.floor((rnd()*2-1)*650)+.5;y=Math.floor((rnd()*2-1)*650)+.5;t=P.l1PlanTile(seed,Math.floor(x),Math.floor(y));if(!t.floor)continue;if(want==='door'&&!t.door)continue;if(want&&want!=='door'&&want!=='room'&&t.style!==want)continue;if(want==='room'&&!t.room)continue;break}
 put(E,x,y);const inf=E.map.inf;window.__rp={x:x-inf.ox,y:y-inf.oy};window.__camOverride={x:x-inf.ox,y:y-inf.oy,h:1.6,yaw:0,pitch:-.05,fov:70,hideVm:true};return 'rand '+i+' '+want+' at '+x+','+y+' '+t.style+(t.room?' room':'')+(t.door?' door':'')};
window.__clr=setInterval(()=>{const E=window.__engine;try{E.npcs.length=0;E.devKillAllEntities()}catch(e){}},700);return 'rand helper'})()"""
def scene(i,want):
  s=M.base[:2]+[["eval",helper],["eval","window.__rand(%d,%s)"%(i,json.dumps(want))],["wait",20000],["eval",M.WAITBAKE],["wait",3000],["eval","window.__engine.plantK=0"],["eval",M.hide],M.ctx]
  for k in range(4):
    s+=[["eval","window.__camOverride.yaw=%f;'y'"%(k*1.5708)],["wait",1500],M.ctx,["shot","rand-%d-%d"%(i,k)]]
  return s
if __name__=='__main__':
  for i,w in [(1,''),(2,'door'),(3,'maintenance'),(4,'room'),(5,'storage'),(6,'ouroboros'),(7,'gothic'),(8,'')]:
    json.dump(scene(i,w),open(f'sc-rand-{i}.json','w'))
