/** Serializable, absolute-world architecture. Three.js objects never cross this boundary. */
import type {L1Puddle} from './l1Puddles'
export type L1StyleName = 'parking'|'storage'|'gothic'|'ouroboros'|'garden'|'maintenance'
export type L1SurfaceName = 'floor'|'wall'|'brick'|'ceiling'|'column'|'paint'|'metal'|'red'|'whitePipe'|'cable'|'peeling'|'ground'|'line'|'leaf'
export type V3 = [number,number,number]
export interface L1Box {
 id:string; min:V3; max:V3; style:L1StyleName; surface:L1SurfaceName
 solid:boolean; occlude:boolean; shape?:'round'; axis?:0|1|2; detail?:boolean
}
export interface L1Emitter {
 id:string; position:V3; normal:V3; tangent:V3; width:number; height:number
 kind:'tube'|'panel'|'sky'|'emergency'; color:V3; power:number; range:number
 style:L1StyleName
 /** Open-backed industrial luminaires spill a little light towards the roof. */
 backEmission?:number
}
export interface L1RoofPatch {id:string;x:number;z:number;w:number;d:number;height:number;style:L1StyleName;sky?:boolean}
export interface L1Opening {id:string;x:number;z:number;w:number;d:number;height:number;door:boolean}
export interface L1ArchitectureData {
 version:4;seed:number;cx:number;cy:number;fingerprint:string
 boxes:L1Box[];roofs:L1RoofPatch[];emitters:L1Emitter[];openings:L1Opening[]
 puddles:L1Puddle[]
 floor:Uint8Array;styles:Uint8Array
}
export const L1_STYLE_NAMES:L1StyleName[]=['parking','storage','gothic','ouroboros','garden','maintenance']
export interface L1Module {
 height:number;spacingX:number;spacingZ:number;phaseX:number;phaseZ:number
 columnWidth:number;columnDepth:number;round:boolean;beamDepth:number;beamWidth:number
 lampSpacing:number;wallTubes:boolean;power:number;finish:'raw'|'paint'|'peeling'
 lighting?:'service-bay'|'wall-bay'|'wall-tubes'
 wallFinish?:'brick'
 tubeSide?:-1|1
 /** Height where a round shaft opens into the vault; ordinary bays default to 1.35m. */
 springHeight?:number
 /** Fractional offsets within the independent lamp grid; default .5. */
 lampPhaseX?:number;lampPhaseZ?:number
 lampAlongZ?:boolean
 /** Ceiling services use continuous bay coordinates, independently of lamp pitch. */
 services?:'white-pipes'|'red-rack'|'service-rack';serviceOffset?:number;serviceDrop?:number
 serviceLight?:{offsetX:number;offsetZ:number;drop:number;range:number;alongZ?:boolean}
 columnPattern?:'mixed'
}
