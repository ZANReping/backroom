// Browser-only integration check against the real Engine and collision modules.
import {canOccupy,moveStep} from '/src/game/core/player.ts'
import {ceilingHeightAt} from '/src/game/world/mapgen.ts'
const check=(v,msg)=>{if(!v)throw new Error(msg)}
const frames=async(n=8)=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame)}
export async function verify(qa){
 const results=[]
 const settle=async()=>{await frames(2);const start=performance.now();while(qa.renderer.builtMap!==qa.engine.map||qa.renderer.chunkGroups.size<qa.engine.map.inf.chunks.size||qa.renderer.cityChunkTask){if(performance.now()-start>90000)throw new Error('streaming timeout');await new Promise(r=>setTimeout(r,100))}}
 for(const variant of ['genhall','boiler']){
  qa.setVariant(variant);await settle();await frames(8)
  const e=qa.engine,m=e.map,p=e.player,ox=m.inf.ox,oy=m.inf.oy
  const d=m.structures.find(s=>s.data?.l3Iron&&s.x+ox>=0&&s.x+ox<32&&s.y+oy>=0&&s.y+oy<32)
  check(d,variant+' iron door exists')
  const cx=d.x+.5,cy=d.y+.5,alongX=!!d.data.rot
  p.x=cx+(alongX?1.1:0);p.y=cy+(alongX?0:1.1);p.z=0;p.facing=alongX?Math.PI:-Math.PI/2
  qa.look.yaw=alongX?Math.PI/2:0;qa.look.pitch=0;await frames()
  check(!canOccupy(m,cx,cy),variant+' closed door blocks')
  e.scanInteract();check(e.interactTarget?.s===d,variant+' aim acquires actual door')
  e.doInteract();await frames()
  check(d.data.open===1&&!d.solid,variant+' opens through E interaction')
  check(canOccupy(m,cx,cy),variant+' open door allows crossing')
  for(let i=0;i<22;i++)moveStep(m,p,alongX?-.1:0,alongX?0:-.1)
  check(alongX?p.x<cx-.7:p.y<cy-.7,variant+' player traverses doorway')
  p.facing=alongX?0:Math.PI/2;qa.look.yaw=alongX?-Math.PI/2:Math.PI;await frames()
  e.scanInteract();check(e.interactTarget?.s===d,variant+' opposite side aims at open door');e.doInteract();await frames()
  check(!d.data.open&&d.solid&&!canOccupy(m,cx,cy),variant+' closes from other side')
  results.push(variant+': aim → open → walk through → close passed')
 }
 qa.setVariant('narrow');await settle();await frames(8)
 const e=qa.engine,m=e.map
 let checked=0
 for(let y=34;y<m.h-34&&checked<20;y++)for(let x=34;x<m.w-34&&checked<20;x++){
  if(m.tint[y*m.w+x]!==51||!canOccupy(m,x+.5,y+.5)||!canOccupy(m,x+.5,y+1.5))continue
  const p={x:x+.5,y:y+.5};for(let j=0;j<10;j++)moveStep(m,p,0,.1)
  check(Math.abs(p.y-(y+1.5))<.01,'narrow corridor movement');check(ceilingHeightAt(m,x+.5,y+.5,3.25)>2.4,'narrow vault headroom');checked++
 }
 check(checked>0,'narrow passage samples');results.push(checked+' curved passage crossings passed')
 qa.setVariant('mixed');await settle();await frames(8)
 const mixed=qa.engine.map,{l3StyleAt,l3RoofAt}=await import('/src/game/world/l3Architecture.ts')
 let seams=0
 for(const axis of ['x','y'])for(const seam of [32,64,96,128])for(let t=34;t<126;t++){
  const ax=axis==='x'?seam-.5:t+.5,ay=axis==='y'?seam-.5:t+.5,bx=ax+(axis==='x'?1:0),by=ay+(axis==='y'?1:0)
  if(!canOccupy(mixed,ax,ay)||!canOccupy(mixed,bx,by))continue
  const pos={x:ax,y:ay};for(let i=0;i<20;i++)moveStep(mixed,pos,(bx-ax)*.05,(by-ay)*.05)
  check(Math.hypot(pos.x-bx,pos.y-by)<.01,'mixed chunk seam remains traversable');seams++
 }
 check(seams>10,'mixed seam samples');results.push(seams+' mixed-region seam crossings passed')
 for(const c of mixed.inf.chunks.values())if(['assembly','genhall','boiler','sanct'].includes(c.variant)){
  const x=c.cx*32-mixed.inf.ox,z=c.cy*32-mixed.inf.oy
  check(l3StyleAt(mixed,x+.5,z+.5)==='lit','room bypass retains corridor style')
  check(l3RoofAt(mixed,x+.5,z+.5)===3.25,'room bypass roof height')
 }
 results.push('all room bypass roofs remain at 3.25m')
 for(const[x,z]of [[32.5,16.5],[64.5,16.5],[.5,.5]]){
  const before=qa.engine.map;let spot
  search:for(let r=0;r<=8;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(canOccupy(before,x+dx-before.inf.ox,z+dz-before.inf.oy)){spot=[x+dx,z+dz];break search}
  check(spot,'walkable streaming test start');const[wx,wz]=spot
  qa.view(wx,wz);qa.engine.updateInfiniteWindow();await settle();await frames()
  const map=qa.engine.map,p=qa.engine.player,inf=map.inf
  check(Math.abs(p.x+inf.ox-wx)<.001&&Math.abs(p.y+inf.oy-wz)<.001,'streaming preserves world position')
  check(canOccupy(map,p.x,p.y),'streamed bypass remains walkable')
  const key=`${Math.floor(wx/32)},${Math.floor(wz/32)}`,g=qa.renderer.chunkGroups.get(key)
  check(g&&g.group.visible&&g.group.children.length>0,'player chunk remains rendered after rebasing')
  for(const[key,cg]of qa.renderer.chunkGroups){const c=inf.chunks.get(key);check(c&&cg.wx===c.cx*32-inf.ox&&cg.wy===c.cy*32-inf.oy,'all retained chunk transforms match world coordinates')}
 }
 results.push('3 streaming/rebase cycles preserve geometry and collisions')
 for(const mode of ['classic','realistic']){
  qa.setMode(mode);await settle();await frames()
  check(!qa.renderer.three.info.programs.some(p=>p.diagnostics?.runnable===false),mode+' shaders compile')
 }
 results.push('classic/realistic mode switches compile and rebuild successfully')
 return results
}
