/** Region/light metering from docs/人眼动态曝光.md, without extra scene draws/readback. */
export class EyeAdaptation {
 exposure=1
 target=1
 glare=0
 private initialized=false
 reset(){this.exposure=this.target=1;this.glare=0;this.initialized=false}
 update(light:number,dt:number,enabled:boolean,options?:{maxExposure?:number;hold?:boolean;darkTau?:number}){
  if(!enabled){this.reset();return 1}
  const maxExposure=Math.max(.65,options?.maxExposure??1.65),hold=options?.hold===true
  // Bounded gain preserves genuinely unlit rooms: exposure never creates light.
  if(!hold)this.target=Math.max(.65,Math.min(maxExposure,Math.pow(.32/Math.max(.035,light),.32)))
  if(!this.initialized){this.exposure=this.target;this.initialized=true}
  if(!hold){const tau=this.target<this.exposure?.25:(options?.darkTau??2.8);this.exposure+=(this.target-this.exposure)*-Math.expm1(-Math.max(0,Math.min(dt,.1))/tau)}
  this.glare=hold?this.glare*Math.exp(-Math.max(0,Math.min(dt,.1))/0.8):Math.min(.65,Math.max(0,this.exposure-this.target)*.7)
  return this.exposure
 }
}
