import json,make_ref as M
helper="""(async()=>{const P=await import('/src/game/world/l1Plan.ts');const sh=await import('/src/game/renderer/shared.ts');
const put=(E,tx,ty)=>{const p=E.player,inf=E.map.inf;p.x=tx-inf.ox;p.y=ty-inf.oy;E.updateInfiniteWindow();const i2=E.map.inf;p.x=tx-i2.ox;p.y=ty-i2.oy;p.z=0;p.vz=0};
window.__free=async(kind,o)=>{const E=window.__engine,seed=E.map.inf.seed;o=o||{};let cx,cy,yaw,px,py;const F=(x,y)=>P.l1PlanTile(seed,Math.floor(x),Math.floor(y)).floor;const T=(x,y)=>P.l1PlanTile(seed,Math.floor(x),Math.floor(y));
 const fwd=(yw)=>[-Math.sin(yw),-Math.cos(yw)];
 if(kind==='corridor'){let best=null;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const FM=(x,y)=>{const t=T(x,y);return t.floor&&t.style==='maintenance'&&!t.room};
  outer:for(let r=20;r<400;r+=3)for(let a=0;a<64;a++){const x=Math.round(Math.cos(a/64*6.283)*r)+.5,y=Math.round(Math.sin(a/64*6.283)*r)+.5;if(!FM(x,y))continue;
   for(const [dx,dy]of dirs){let ok=true;for(let s=0;s<16&&ok;s++){const qx=x+dx*s,qy=y+dy*s;if(!FM(qx,qy)){ok=false;break}let a1=0,b1=0;while(FM(qx-dy*(a1+1),qy-dx*(a1+1))&&a1<4)a1++;while(FM(qx+dy*(b1+1),qy+dx*(b1+1))&&b1<4)b1++;if(a1+b1+1>3)ok=false}
    if(ok){best=[x,y,dx,dy];break outer}}}
  if(!best)return 'no corridor';let [x,y,dx,dy]=best;
  // centre across the corridor
  let a=0,b=0;while(F(x-dy*(a+1),y-dx*(a+1))&&a<3)a++;while(F(x+dy*(b+1),y+dx*(b+1))&&b<3)b++;const off=(b-a)/2;px=x+dy*off-dx*.3;py=y+dx*off-dy*.3;yaw=Math.atan2(-dx,-dy)}
 else if(kind==='room'){const rs=P.l1PlanRooms(seed,-600,-600,600,600).filter(r=>!o.type||r.type===o.type).sort((a,b)=>Math.hypot(a.x0,a.y0)-Math.hypot(b.x0,b.y0));const r=rs[0];if(!r)return 'no room';
  const w=r.x1-r.x0,h=r.y1-r.y0;if(h>=w){px=r.x0+w*.32;py=r.y1-.45;yaw=Math.atan2(-(w*.36),(h))*-1;yaw=Math.atan2(-((r.x0+w*.62)-px),-((r.y0)-py))}else{px=r.x1-.45;py=r.y0+h*.32;yaw=Math.atan2(-((r.x0)-px),-((r.y0+h*.62)-py))}}
 else if(kind==='fabled'){const rs=P.l1PlanRegions(seed,-3000,-3000,3000,3000).filter(r=>r.section==='fabled').sort((a,b)=>Math.hypot(a.ix0,a.iy0)-Math.hypot(b.ix0,b.iy0));const r=rs[0];if(!r)return 'no fabled';
  px=r.ix0+(o.back??13);py=(r.iy0+r.iy1)/2+(o.side??0);const tx=r.ix0,ty=py-(o.skew??3);yaw=Math.atan2(-(tx-px),-(ty-py))}
 for(let k=0;k<30&&!F(px,py);k++){const f=fwd(yaw);px+=f[0]*.4;py+=f[1]*.4}
 put(E,px,py);sh.look.yaw=yaw;const inf=E.map.inf;
 window.__camOverride={x:px-inf.ox,y:py-inf.oy,h:o.h??1.6,yaw:yaw+(o.dyaw||0),pitch:o.pitch??0,roll:0,fov:o.fov??60,hideVm:true};
 return kind+' at '+px.toFixed(1)+','+py.toFixed(1)+' yaw '+yaw.toFixed(2)};
window.__clr=setInterval(()=>{const E=window.__engine;try{E.npcs.length=0;E.devKillAllEntities()}catch(e){}},700);return 'free helper'})()"""
def scene(name,kind,o):
  s=M.base[:2]+[["eval",helper],["eval","window.__free(%s,%s)"%(json.dumps(kind),json.dumps(o))],["wait",20000],["eval",M.WAITBAKE],["wait",4000]]
  s+=[["eval","window.__engine.plantK=0"],["eval",M.hide],["wait",2500],M.ctx,["shot","ref-"+name]]
  return s
if __name__=='__main__':
  json.dump(scene('path-corridor','corridor',{'h':2.05,'pitch':-.2,'fov':62}),open('sc-ref-path-corridor.json','w'))
  json.dump(scene('path-room','room',{'type':'sickbay','h':2.3,'pitch':-.34,'fov':64}),open('sc-ref-path-room.json','w'))
  json.dump(scene('fabled','fabled',{'h':1.9,'pitch':-.12,'fov':58}),open('sc-ref-fabled.json','w'))
