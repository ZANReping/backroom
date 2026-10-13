import type {Engine,Projectile} from '../engine'
/** Airborne sticks retain velocity across a save; coordinates are world-relative. */
export function captureGlowFlight(eng:Engine):Projectile[]{
 const inf=eng.map?.inf
 return eng.projectiles.filter(p=>p.type==='glowstick'&&!p.done).map(p=>({...p,x:p.x+(inf?.ox??0),y:p.y+(inf?.oy??0)}))
}
export function restoreGlowFlight(eng:Engine,saved:Projectile[]|undefined){
 eng.projectiles=eng.projectiles.filter(p=>p.type!=='glowstick')
 if(!Array.isArray(saved))return
 const inf=eng.map?.inf
 for(const p of saved){
  if(p.type!=='glowstick'||p.done||![p.x,p.y,p.z,p.floorZ,p.vx,p.vy,p.vz].every(Number.isFinite))continue
  eng.projectiles.push({...p,id:eng.projId++,x:p.x-(inf?.ox??0),y:p.y-(inf?.oy??0)})
 }
}
/** Leaving a level settles its sticks before the existing world ledger is saved. */
export function settleGlowFlight(eng:Engine){
 if(eng.map)for(const p of eng.projectiles)if(p.type==='glowstick'&&!p.done)eng.landProjectile(p,p.x,p.y)
 eng.projectiles=eng.projectiles.filter(p=>p.type!=='glowstick')
}
