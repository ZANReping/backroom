import type {L1BakedMesh} from '../world/l1BakeTypes'
import {l1ParkingSkin} from '../world/l1Spatial'
export type L1SurfaceMesh=L1BakedMesh&{skin?:string}
/** Partition only indices, by the actual hall under each surface. The baked
 * position/normal/UV arrays and atlas remain unchanged, including at seams. */
export function l1SurfaceMeshes(seed:number,cx:number,cy:number,b:L1BakedMesh):L1SurfaceMesh[]{
 if(b.style!=='parking')return[b]
 const groups=new Map<string,number[]>()
 for(let i=0;i<b.index.length;i+=3){
  let x=0,z=0,nx=0,nz=0
  for(let k=0;k<3;k++){const j=b.index[i+k]*3;x+=b.position[j];z+=b.position[j+2];nx+=b.normal[j];nz+=b.normal[j+2]}
  const skin=l1ParkingSkin(seed,cx*32+x/3+nx*.02,cy*32+z/3+nz*.02)
  let indices=groups.get(skin);if(!indices)groups.set(skin,indices=[])
  indices.push(b.index[i],b.index[i+1],b.index[i+2])
 }
 if(groups.size===1)return[{...b,skin:groups.keys().next().value}]
 return [...groups].map(([skin,index])=>({...b,skin,index:new Uint32Array(index)}))
}
