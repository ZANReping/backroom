const LOWER_SECONDS=.095,RAISE_SECONDS=.125

/** Visual only: input selection and item use stay immediate. A quick new slot
 * retargets the hand already moving down, without flashing intermediate items. */
export class ViewmodelSwitch {
 private slot:number|null=null
 private target=''
 held=''
 dip=0
 phase:'idle'|'lower'|'raise'='idle'

 update(slot:number,requested:string,dt:number,animate=true){
  if(this.slot===null||!animate){
   this.slot=slot;this.target=this.held=requested;this.dip=0;this.phase='idle'
   return
  }
  if(slot!==this.slot){this.slot=slot;this.target=requested;this.phase='lower'}
  else if(requested!==this.target){
   // A consumed/dropped item or a scripted temporary weapon is not a new
   // hotbar gesture. Display it immediately and leave the action unobstructed.
   this.target=this.held=requested;this.dip=0;this.phase='idle'
  }
  let remaining=Math.max(0,Math.min(.1,dt))
  if(this.phase==='lower'){
   const step=Math.min(remaining,(1-this.dip)*LOWER_SECONDS)
   this.dip=Math.min(1,this.dip+step/LOWER_SECONDS);remaining-=step
   if(this.dip>=1-1e-8){this.dip=1;this.held=this.target;this.phase='raise'}
  }
  if(this.phase==='raise'){
   this.dip=Math.max(0,this.dip-remaining/RAISE_SECONDS)
   if(this.dip<=1e-8){this.dip=0;this.phase='idle'}
  }
 }
}
