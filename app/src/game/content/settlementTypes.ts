/** Authored game adaptation. Coordinates are metres, rectangles exclude their upper bound. */
export type SettlementId = 'alpha' | 'bntg' | 'ariane' | 'tom' | 'cornucopia'
export type CareerId = 'meg' | 'bntg' | 'ariane' | 'brc' | 'jerry' | 'argos' | 'tom'
export type RoomStyle = 'office' | 'radio' | 'classroom' | 'auditorium' | 'store' | 'lab' | 'clinic' | 'archive' | 'bedroom' | 'residential' | 'dining' | 'kitchen' | 'market' | 'vault' | 'intake' | 'holding' | 'garden' | 'library' | 'wash' | 'workshop'
export interface RoomSpec {
  id: string; name: string; x: number; y: number; w: number; h: number
  style: RoomStyle; height: number; door: 'n' | 's' | 'e' | 'w'
  through?: boolean; access?: number; service?: string; npc?: string; housing?: 'single' | 'double' | 'family'
}
export interface SettlementBlueprint {
  id: SettlementId; level: number; size: number; faction: CareerId; name: string
  rooms: RoomSpec[]; corridors: {x: number; y: number; w: number; h: number}[]
  exits: {x: number; y: number}[]; spawn: {x: number; y: number}
}
export interface SettlementMapData {
  blueprint: SettlementBlueprint
  heights: Float32Array
  roomIndex: Int16Array
}
export const room = (id: string, name: string, x: number, y: number, w: number, h: number, style: RoomStyle, door: RoomSpec['door'] = 's', extra: Partial<RoomSpec> = {}): RoomSpec => ({
  id, name, x, y, w, h, style, door,
  height: style === 'auditorium' ? 4.4 : style === 'market' ? 4.8 : style === 'vault' ? 3.6 : ['lab','radio','kitchen'].includes(style) ? 3.2 : ['bedroom','residential'].includes(style) ? 2.6 : 2.8,
  ...extra,
})
