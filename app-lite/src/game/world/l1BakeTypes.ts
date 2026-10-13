import type {L1StyleName,L1SurfaceName,V3} from './l1BuildingTypes'
export type L1BakeQuality='low'|'high'
export const L1_BAKE_REVISION=12
export interface L1BakedMesh {style:L1StyleName;surface:L1SurfaceName;position:Float32Array;normal:Float32Array;uv:Float32Array;uv1:Float32Array;index:Uint32Array}
export interface L1Probe {position:V3;color:V3;indirect:V3;direction:V3;portal?:number[];indirectPortal?:number[]}
export interface L1BakeResult {
 version:4;bakeRevision:number;fingerprint:string;seed:number;cx:number;cy:number;quality:L1BakeQuality;
 size:number;irradiance:Uint16Array;direction:Uint8Array;meshes:L1BakedMesh[];probes:L1Probe[];
 /** Fraction of native transport crossing each of up to eight nearby doors.
  * Two RGBA planes are stacked vertically; absent outside portal influence. */
 portalIds?:string[];portalWeights?:Uint8Array;
 metrics:{generationMs:number;geometryMs:number;bakeMs:number;decodeMs?:number;samples:number;rays:number;bytes:number}
}
export function l1BakeBuffers(r:L1BakeResult):ArrayBuffer[]{return [r.irradiance.buffer,r.direction.buffer,...(r.portalWeights?[r.portalWeights.buffer]:[]),...r.meshes.flatMap(m=>[m.position.buffer,m.normal.buffer,m.uv.buffer,m.uv1.buffer,m.index.buffer])] as ArrayBuffer[]}
