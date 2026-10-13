import assert from 'node:assert/strict'
import { EyeAdaptation } from '../src/game/renderer/eyeAdaptation'

for (const hz of [60, 30]) {
  const e=new EyeAdaptation(),dt=1/hz,step=(light:number,seconds:number,options?:{maxExposure?:number;hold?:boolean;darkTau?:number})=>{for(let i=0;i<Math.round(seconds*hz);i++){e.update(light,dt,true,options);assert(Number.isFinite(e.exposure)&&e.exposure>=.65&&e.exposure<=1.35);assert(Number.isFinite(e.target)&&e.target>=.65&&e.target<=1.35)}}
  step(.32,1,{maxExposure:1.35}); const held=e.exposure;step(.06,2,{maxExposure:1.35,hold:true});assert.equal(e.exposure,held);const glare=e.glare;assert(glare>=0)
  step(.01,.5,{maxExposure:1.35,darkTau:3.6});assert(e.exposure>held&&e.exposure<1.06,'dark adaptation is slow');step(.01,44.5,{maxExposure:1.35,darkTau:3.6});const dark=e.exposure;
  step(.32,.1,{maxExposure:1.35});assert(e.glare>.1,'restoration briefly blooms');step(.32,.9,{maxExposure:1.35});const recoveryGlare=e.glare;assert(Math.abs(e.exposure-1)<.01,'bright adaptation settles in one second');step(.32,2,{maxExposure:1.35});assert(e.glare<recoveryGlare&&e.exposure<dark)
  e.update(.01,dt,true,{maxExposure:1.35});e.update(.01,dt,false,{maxExposure:1.35});assert.equal(e.exposure,1);assert.equal(e.target,1)
  const l0=new EyeAdaptation();l0.update(.01,dt,true);assert(l0.exposure<=1.65&&l0.exposure>=.65)
}
console.log('L1 exposure checks passed')
