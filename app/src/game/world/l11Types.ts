import type { Polygon, MultiPolygon, Point } from './l11Geometry'
import type { L11Archetype } from '../content/l11Buildings'
import type { L11FacadeProfile } from './l11ReferenceDistrict'
export type L11Variant='lowrise'|'apartments'|'mixed'|'highrise'|'industrial'|'park'|'transit'
export interface L11Road {id:string;points:Point[];width:number;sidewalk:number;class:'arterial'|'collector'|'local'|'waterfront';pedestrian?:boolean;polygon:MultiPolygon;bounds:{x:number;y:number;w:number;h:number}}
export interface L11Canal {id:string;points:Point[];width:number;water:MultiPolygon;banks:MultiPolygon;pedestrian?:boolean}
export interface L11Block {id:string;polygon:Polygon;angle:number;district:L11Variant;density:number;waterfront:boolean}
export interface L11Volume {x:number;y:number;w:number;d:number;lo:number;hi:number;shape?:'round'|'gable'|'sawtooth'|'barrel';facadeProfile?:L11FacadeProfile;faceProfiles?:Partial<Record<'n'|'s'|'e'|'w',L11FacadeProfile>>;soffit?:boolean}
export interface L11Stair {x:number;y:number;width:number;length:number;axis:'x'|'y';flight:number}
export interface L11BuildingExit {kind:'l11unfinisheddoor'|'l11liftshaft'|'l11brickdoor'|'l11officedoor'|'basebeta';center:Point;angle:number;floor:0|1|2;width:number;roomId?:string}
export interface L11Building {
  id:string;x:number;y:number;w:number;h:number;ox:number;oy:number;width:number;depth:number;angle:number;base:number
  floors:number;accessible:number;sealed:boolean;style:number;finish:number;use:number;front:'n'|'s'|'w'|'e';district:L11Variant;seed:number
  archetype:L11Archetype;footprint:Polygon;localFootprint:Polygon;volumes:L11Volume[];stairs:L11Stair[];door:Point;doorLocal:Point;doorAngle:number;blockId:string
  facadeProfile?:L11FacadeProfile
  architecture?:import('../content/l11Architecture').L11Architecture
  sourceRecipe?:string
  entrance?:{rise:number;run:number;width:number;gardens:boolean}
  verticalSign?:{id:'pegasus'|'hotel'|'clinic'|'cinema';mount:'flush'|'blade';side:'n'|'s'|'e'|'w'}
  exit?:L11BuildingExit
}
export interface L11Alley {id:string;polygon:Polygon;width:number;buildingIds:string[]}
export interface L11Bridge {id:string;roadId:string;polygon:Polygon;arch?:{origin:Point;axis:Point;start:number;end:number;width:number;rise:number;approach:number;owner?:string;deck?:MultiPolygon}}
export interface L11CityPlan {
  version:number;seed:number;mx:number;my:number;id:string;bounds:{x:number;y:number;w:number;h:number}
  canals:L11Canal[];roads:L11Road[];blocks:L11Block[];buildings:L11Building[];alleys:L11Alley[];bridges:L11Bridge[]
  stages:readonly ['terrain','roads','blocks','buildings','alleys','dressing'];boundary:{north:string;south:string;east:string;west:string}
}
export interface L11ChunkData {
  crosswalks?:import('./l11RoadMarkings').L11Crosswalk[]
  version:number;seed:number;cx:number;cy:number;macroIds:string[];buildings:L11Building[];roads:L11Road[];canals:L11Canal[];bridges:L11Bridge[];alleys:L11Alley[]
}
