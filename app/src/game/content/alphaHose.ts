/** Metre-space extraction arm; reused by mesh and offline occlusion sampling. */
export function alphaHosePoint(t:number):[number,number,number]{
 const s=1-t
 const x=3*s*s*t*.62+3*s*t*t*1.50+t*t*t*1.98
 const y=s*s*s*1.28+3*s*s*t*1.20+3*s*t*t*.42+t*t*t*.16
 return [x-1.0,y-.72,0]
}
export const ALPHA_HOSE_SIZE=[2.2,1.55,.5] as const
