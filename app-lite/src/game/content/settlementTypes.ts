/** Authored game adaptation. Coordinates are metres, rectangles exclude their upper bound. */
export type SettlementId = 'alpha' | 'bntg' | 'ariane' | 'tom' | 'cornucopia'
export type CareerId = 'meg' | 'bntg' | 'ariane' | 'brc' | 'jerry' | 'argos' | 'tom'
export type RoomStyle = 'office' | 'radio' | 'classroom' | 'auditorium' | 'store' | 'lab' | 'clinic' | 'archive' | 'bedroom' | 'residential' | 'dining' | 'kitchen' | 'market' | 'vault' | 'intake' | 'holding' | 'garden' | 'library' | 'wash' | 'workshop'
export interface RoomSpec {
  id: string; name: string; x: number; y: number; w: number; h: number
  style: RoomStyle; height: number; door: 'n' | 's' | 'e' | 'w'
  through?: boolean; access?: number; service?: string; npc?: string; housing?: 'single' | 'double' | 'family'
  enclosed?: boolean
  floorMaterial?: SurfaceMaterial
  furniture?: FurniturePlacement[]
}
export type SurfaceMaterial='concrete'|'plaster'|'wood'|'metal'|'fabric'|'tile'|'ceiling'|'glass'|'paint'|'dark'|'leaf'
export interface Rect {x:number;y:number;w:number;h:number}
export interface FurniturePlacement {kind:'desk'|'counter'|'shelf'|'radio'|'table'|'booth'|'bed'|'sofa'|'lab'|'sink'|'stove'|'fridge'|'board'|'planter'|'screen'|'locker';x:number;y:number;w?:number;d?:number;turn?:number;label?:string;seats?:number}
export interface PartitionSpec extends Rect {height:number;material:SurfaceMaterial;bottom?:number;label?:string}
export interface DoorSpec extends Rect {id:string;access:number;height:number;axis:'x'|'y'}
export interface ServiceSpec {id:string;zone:string;x:number;y:number;label:string;services:string[];access?:number;npc?:string;facing?:number;mount?:'counter'|'wall'|'board'}
export interface ShellSpec extends Rect {height:number;roof:'industrial'|'vault'|'slab'|'domestic'}
export interface SettlementBlueprint {
  /** Named story contacts placed independently of service counters. */
  staff?: { id: string; x: number; y: number }[]
  decorations?:import('../core/types').Structure[]
  id: SettlementId; level: number; size: number; faction: CareerId; name: string
  rooms: RoomSpec[]; corridors: {x: number; y: number; w: number; h: number}[]
  exits: {x: number; y: number}[]; spawn: {x: number; y: number}
  shells:ShellSpec[]; partitions:PartitionSpec[]; doors:DoorSpec[]; services:ServiceSpec[]
  circulation:Rect[]
  focus:{x:number;y:number;targets:string[]}
}
export interface SettlementMapData {
  blueprint: SettlementBlueprint
  heights: Float32Array
  roomIndex: Int16Array
  roofIndex:Int16Array
}
export const room = (id: string, name: string, x: number, y: number, w: number, h: number, style: RoomStyle, door: RoomSpec['door'] = 's', extra: Partial<RoomSpec> = {}): RoomSpec => ({
  id, name, x, y, w, h, style, door,
  height: style === 'auditorium' ? 4.4 : style === 'market' ? 4.8 : style === 'vault' ? 3.6 : ['lab','radio','kitchen'].includes(style) ? 3.2 : ['bedroom','residential'].includes(style) ? 2.6 : 2.8,
  ...extra,
})
