import json,sys
base=json.load(open('sc-hall-storage.json'))
helper="""(async()=>{const S=await import('/src/game/world/l1Spatial.ts');const sh=await import('/src/game/renderer/shared.ts');
const put=(E,tx,ty)=>{const p=E.player,inf=E.map.inf;p.x=tx-inf.ox;p.y=ty-inf.oy;E.updateInfiniteWindow();const i2=E.map.inf;p.x=tx-i2.ox;p.y=ty-i2.oy;p.z=0;p.vz=0};
window.__ref=async(id,o)=>{const E=window.__engine,seed=E.map.inf.seed;const a=S.l1FindReference(seed,id);if(!a)return 'none '+id;o=o||{};
 const ax=a.x+(o.dx||0),ay=a.y+(o.dy||0);put(E,ax,ay);sh.look.yaw=a.yaw;sh.look.pitch=a.pitch;
 const inf=E.map.inf;window.__camOverride={x:ax-inf.ox,y:ay-inf.oy,h:1.55+a.z+(o.dh||0),yaw:a.yaw+(o.dyaw||0),pitch:a.pitch+(o.dp||0),roll:a.roll||0,fov:o.fov||a.fov,hideVm:true};
 window.__refA=a;return 'ref '+id+' c '+a.centerX+','+a.centerY+' cam '+ax.toFixed(1)+','+ay.toFixed(1)+' fov '+a.fov.toFixed(1)+' asp '+(a.width/a.height).toFixed(3)};
window.__clr=setInterval(()=>{const E=window.__engine;try{E.npcs.length=0;E.devKillAllEntities()}catch(e){}},700);return 'helper'})()"""
WAITBAKE="(async()=>{const Q=await import('/src/game/renderer/l1BakeQueue.ts');let ok=0,t0=Date.now(),st;while(Date.now()-t0<300000){st=Q.l1BakeStats();if(st.active===0&&st.queued===0){if(++ok>=4)break}else ok=0;await new Promise(r=>setTimeout(r,2500))}return 'bake idle '+((Date.now()-t0)/1000|0)+'s q'+st.queued+' a'+st.active+' done'+st.completed})()"
hide="(()=>{const cs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height);const main=cs[0];for(const e of document.querySelectorAll('body *')){if(e===main||e.contains(main))continue;e.style.visibility='hidden'}return 'hud hidden'})()"
ctx=[x for x in base if x[0]=='eval' and 'restoreContext' in x[1]][0]
def scene(id,o=None,extra=None,name=None):
  s=base[:2]+[["eval",helper],["eval","window.__ref(%s,%s)"%(json.dumps(id),json.dumps(o or {}))],["wait",20000],["eval",WAITBAKE],["wait",4000]]
  if extra: s+=extra
  s+=[["eval","window.__engine.plantK=0"],["eval",hide],["wait",2500],ctx,["shot","ref-"+(name or id)]]
  return s
if __name__=='__main__':
  for id in sys.argv[1:]:
    ex=[["eval","window.__engine.applyBlackout();'bo'"],["wait",8000]] if id=='power-out' else None
    json.dump(scene(id,extra=ex),open(f'sc-ref-{id}.json','w'))
