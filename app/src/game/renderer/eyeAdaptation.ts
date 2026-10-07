/** Region/light metering from docs/人眼动态曝光.md, without extra scene draws/readback. */
export class EyeAdaptation {
 exposure=1
 target=1
 glare=0
 private initialized=false
 reset(){this.exposure=this.target=1;this.glare=0;this.initialized=false}
 update(light:number,dt:number,enabled:boolean){
  if(!enabled){this.reset();return 1}
  // Bounded gain preserves genuinely unlit rooms: exposure never creates light.
  this.target=Math.max(.65,Math.min(1.65,Math.pow(.32/Math.max(.035,light),.32)))
  if(!this.initialized){this.exposure=this.target;this.initialized=true}
  const tau=this.target<this.exposure?.25:2.8
  this.exposure+=(this.target-this.exposure)*-Math.expm1(-Math.max(0,Math.min(dt,.1))/tau)
  this.glare=Math.min(.65,Math.max(0,this.exposure-this.target)*.7)
  return this.exposure
 }
}
