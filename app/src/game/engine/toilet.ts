import type { Engine } from '../engine'
import type { SittingState } from './seating'
import type { SpecialAction } from './special'
import { audio } from '../core/audio'
import { playToiletFart } from '../core/toiletAudio'

const nextSound = new WeakMap<SittingState, number>()
export function toiletSpecial(eng: Engine): SpecialAction | null {
  return eng.seating?.phase === 'seated' && eng.seating.anchor.toilet
    ? {id:'toiletFart',label:'放屁',hint:'坐在马桶上时点按发出放屁声',hold:false} : null
}
/** A discrete press, never a held action. Cooldown belongs to this sit session and is not saved. */
export function useToiletSpecial(eng: Engine): boolean {
  if(!toiletSpecial(eng))return false
  const state=eng.seating!
  if(eng.time<(nextSound.get(state)??-Infinity))return true
  if(playToiletFart(audio.fxNodes()))nextSound.set(state,eng.time+1.1)
  return true
}
