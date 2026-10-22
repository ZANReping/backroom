import {l7TerrainTileAt} from './infiniteL7'

/** Terrain-only chart preview. Never generates live actors, loot or props. */
export function l7BathymetryCell(seed:number,cx:number,cy:number){
 const seaFloor=new Float32Array(1024),liquid=new Uint8Array(1024),elev=new Uint8Array(1024),cabin=new Uint8Array(1024)
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const i=y*32+x,t=l7TerrainTileAt(seed,cx*32+x,cy*32+y)
  seaFloor[i]=t.depth;liquid[i]=t.water?1:0;elev[i]=t.elev;cabin[i]=t.cabin
 }
 return{cx,cy,variant:cx===0&&cy===0?'entry':'ocean',tiles:new Uint8Array(1024).fill(1),tint:new Uint8Array(1024),elev,seaFloor,liquid,cabin,walls:[]}
}
