import type {Engine} from '../engine'
export interface LightingProfile {exposure:number;ambient:number;reflection:number;white:[number,number,number];bloom:number;ao:number;saturation?:number}
const profile=(exposure:number,ambient:number,reflection:number,white:LightingProfile['white'],bloom=.13,ao=.32):LightingProfile=>({exposure,ambient,reflection,white,bloom,ao})
/** Relative to each level's own weather/day/night/underwater lighting; no automatic exposure. */
export const LEVEL_LIGHTING:Record<number,LightingProfile>={
 0:profile(.94,.55,.16,[1.025,1,.95],.09,.36),
 1:profile(.97,.76,.42,[1.02,1,.97]),2:profile(.94,.64,.3,[1,.99,.96]),
 3:profile(.92,.64,.28,[1.035,1,.96]),4:profile(1,.84,.56,[.98,1,1.025]),
 5:profile(.98,.76,.4,[1.025,1,.965]),6:profile(1,1,.035,[.97,1,1.035],.035,.18),
 7:profile(.93,.9,.68,[.98,1,1.015],.1,.2),8:profile(.97,.78,.32,[1.02,1,.97],.1,.4),
 9:profile(.98,.74,.22,[.985,1,1.02],.12,.36),10:profile(.94,.88,.7,[1.015,1,.985],.1,.22),
 11:profile(.94,.85,.66,[1,1,1],.1,.25),12:profile(.91,.78,.33,[1,1,1],.08,.25),
 101:profile(.97,.8,.46,[1.02,1,.98]),102:profile(.97,.76,.42,[1.025,1,.96]),
 103:profile(.98,.78,.4,[1.025,1,.97]),104:profile(.97,.8,.42,[1,1,1]),
 105:profile(.96,.76,.4,[1.02,1,.97]),106:profile(.98,.8,.43,[1,1,1]),
 107:profile(.97,.78,.42,[1.02,1,.98]),108:profile(.95,.78,.42,[1.025,1,.98]),
 109:profile(.98,.8,.42,[1.01,1,.99]),110:profile(.97,.8,.42,[1.025,1,.98]),
 111:profile(.96,.78,.4,[1.025,1,.98]),112:profile(.98,.8,.44,[1.02,1,.98]),
 113:profile(.97,.8,.4,[1.01,1,.99]),114:profile(.98,.8,.46,[1.025,1,.98]),
 115:profile(.96,.78,.44,[1.025,1,.98]),116:profile(.97,.8,.43,[1.015,1,.99]),
 274:profile(.97,.8,.46,[1.035,1,.95],.12,.35),
}
export function lightingProfile(eng:Engine):LightingProfile{
 const p=LEVEL_LIGHTING[eng.player.level]??LEVEL_LIGHTING[101]
 if(eng.player.level!==0||!eng.map)return p
 return p
}
