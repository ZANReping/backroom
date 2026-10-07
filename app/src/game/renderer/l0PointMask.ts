import type {Camera,Object3D,PointLight} from 'three'

export const l0StaticPointMask={value:new Float32Array(128)}
const ordered:PointLight[]=[]
/** Match WebGLLights' stable shadow-first order, including the lighter and any
 * other live point lights. Pool slot indices are not shader uniform indices. */
export function syncL0PointMask(scene:Object3D,camera:Camera){
 ordered.length=0
 scene.traverseVisible(o=>{if((o as PointLight).isPointLight&&o.layers.test(camera.layers))ordered.push(o as PointLight)})
 ordered.sort((a,b)=>Number(b.castShadow)-Number(a.castShadow))
 const values=l0StaticPointMask.value;values.fill(0)
 for(let i=0;i<Math.min(values.length,ordered.length);i++)values[i]=ordered[i].userData.l0Baked?1:0
 ordered.length=0 // Do not retain lights/scene parents after renderer disposal.
}
