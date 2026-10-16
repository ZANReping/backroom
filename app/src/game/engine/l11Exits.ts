import type { Engine } from '../engine'
import { captureL11 } from './l11State'

export const L11_ARCHIVE_TAPES=6
/** Return true when this interaction is the submission step (or is blocked). */
export function submitL11ArchiveTapes(eng:Engine):boolean{
  if(eng.l11World?.archiveUnlocked)return false
  const held=eng.countItem('tape')
  if(held<L11_ARCHIVE_TAPES){eng.msg(`木门仍贴着封条。提交六盘随身携带的磁带后才能拆封。（当前 ${held}/${L11_ARCHIVE_TAPES}）`,'system');return true}
  const state=eng.l11World??captureL11(eng)
  if(!state){eng.msg('档案馆尚未准备完成，请稍后重试。','system');return true}
  // Validate the entire amount before consuming. Repeated interactions cannot charge twice.
  for(let i=0;i<L11_ARCHIVE_TAPES;i++)eng.consumeItem('tape')
  eng.player.tapes=Math.max(0,eng.player.tapes-L11_ARCHIVE_TAPES)
  state.archiveUnlocked=true;eng.l11World=state
  eng.msg('你提交了六盘磁带，撕下木门上的封条。门锁已经松开；再次交互可进入 Level 601。','lore')
  return true
}
/** Walking through the exposed lift-core opening, rather than using an invisible door. */
export function stepL11Shaft(eng:Engine){
  if(eng.levelDef.id!==11||!eng.map||eng.transition||eng.dev.fly||eng.dev.noclip)return
  const p=eng.player
  for(const e of eng.map.exits){
    if(e.def.kind!=='l11liftshaft'||!e.l11||Math.abs(p.z-(e.z??0))>.65)continue
    const dx=p.x-e.x-.5,dy=p.y-e.y-.5,c=Math.cos(e.l11.angle),s=Math.sin(e.l11.angle),u=dx*c+dy*s,v=-dx*s+dy*c
    if(Math.abs(u)<.78&&v>.28&&v<2.35){e.discovered=true;eng.msg('电梯井里的混凝土墙消失了。脚下的震动变成了管道深处的轰鸣。','lore');eng.takeExit(e.def);return}
  }
}
