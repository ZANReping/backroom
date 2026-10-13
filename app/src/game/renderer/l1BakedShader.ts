/** A baked surface has no native point-light contribution. Skip its entire
 * evaluation (including shadow sampling), rather than calculating PBR and then
 * multiplying the light by zero. The uniform condition is draw-wide, and the
 * loop shape remains compatible with Three.js' GLSL unroller. Portable lights
 * have mask 0 and retain exactly the original evaluation. */
export function l1BakedPointLights(chunk:string){
 const start=chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'),end=chunk.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )')
 if(start<0||end<=start)throw Error('Unsupported Three.js point-light shader section')
 const assignment='pointLight = pointLights[ i ];'
 const direct='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'
 const point=chunk.slice(start,end)
 if(point.split(assignment).length!==2||point.split(direct).length!==2)throw Error('Unsupported Three.js point-light shader loop')
 return chunk.slice(0,start)+point.replace(assignment,'if ( l1BakedMask[i] < .5 ) {\n'+assignment).replace(direct,direct+'\n}')+chunk.slice(end)
}
