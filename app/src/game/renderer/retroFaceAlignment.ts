import measuredEyes from './retroNamedFaceAlignment.json'
import type {RetroNpcMeta} from './retroNpc'

/** Offline pupil measurements, normalized source coordinates with V downward. */
export const NAMED_FACE_EYES: Readonly<Record<string,readonly number[]>> = measuredEyes

/** Correct the photo's roll/center while keeping the mesh, eyes and fitted gear upright. */
export function namedFaceMeta(id:string,base:RetroNpcMeta):RetroNpcMeta {
 const eyes=NAMED_FACE_EYES[id];if(!eyes)return base
 const [lx,ly,rx,ry]=eyes,dx=rx-lx,dy=ry-ly,distance=Math.hypot(dx,dy)
 const cos=dx/distance,sin=dy/distance,cx=(lx+rx)/2,cy=(ly+ry)/2
 const scale=distance/(base.landmarks[5]-base.landmarks[4]),eyeCenter=(base.landmarks[4]+base.landmarks[5])/2
 return {
  ...base,
  faceEyeV:cy,
  // Leveled photo → original photo. Both open/blink maps use these same UVs.
  faceUV:[cos*scale,-sin,cx-eyeCenter*cos*scale+cy*sin,sin*scale,cos,cy-eyeCenter*sin*scale-cy*cos],
 }
}
