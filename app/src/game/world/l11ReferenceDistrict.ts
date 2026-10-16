import type { L11Archetype } from '../content/l11Buildings'
import type { L11Building, L11Volume } from './l11Types'
import type { L11Architecture } from '../content/l11Architecture'

/** A walkable district arrangement. Its massing and detail recipes also feed
 * ordinary city lots; only the reference arrangement uses fixed coordinates. */
export const L11_REFERENCE_SEED=20261014
export const L11_REFERENCE_VERSION=16
export type L11FacadeProfile='civic-piers'|'sandstone-grid'|'blue-curtain'|'green-curtain'|'service-wall'|'bronze-curtain'|'white-ribbon'|'brick-apartments'|'glazed-core'
export interface L11ReferenceLot {
  key:string;x:number;y:number;w:number;d:number;floors:number;accessible:number
  archetype:L11Archetype;profile:L11FacadeProfile;front:L11Building['front'];volumes?:L11Volume[];architecture?:L11Architecture;verticalSign?:L11Building['verticalSign'];entrance?:L11Building['entrance']
}
export const l11ReferenceRegion=(seed:number,mx:number,my:number)=>seed===L11_REFERENCE_SEED&&mx===0&&my===0
export const L11_REFERENCE_RESERVES=[
  {x:164,y:156,w:216,h:360},
  {x:50,y:560,w:166,h:82},
  {x:72,y:652,w:100,h:116},
  {x:598,y:566,w:326,h:368},
  {x:600,y:417,w:40,h:39},{x:793,y:417,w:39,h:39},
  {x:833.5,y:472,w:38.5,h:40},{x:888,y:376,w:39,h:39},
  {x:600,y:376,w:42,h:32},{x:736,y:400,w:30,h:44},
  {x:600,y:472,w:78,h:42},{x:793,y:472,w:30,h:42},
  {x:656,y:539,w:56,h:30},{x:808,y:539,w:72,h:30},
  {x:936,y:424,w:30,h:30},
]
export const L11_REFERENCE_LOTS:L11ReferenceLot[]=[
  // A continuous downtown street wall. Rear courts remain reached from the
  // parallel streets, and cross-street gaps are kept at y=272 and y=400.
  {key:'west-piers',x:192,y:340,w:65,d:48,floors:10,accessible:2,archetype:'fin-office',profile:'civic-piers',front:'e',architecture:'pier-retail'},
  {key:'west-limestone',x:196,y:296,w:61,d:38,floors:15,accessible:2,archetype:'setback-office',profile:'sandstone-grid',front:'e'},
  // Keep stable lot IDs while correcting the two different elevations in
  // 11iconic: a bronze/glass foreground office, then the warm stone ad tower.
  {key:'east-stone',x:291,y:346,w:60,d:42,floors:18,accessible:2,archetype:'fin-office',profile:'bronze-curtain',front:'w',architecture:'glazed-terrace',entrance:{rise:2.1,run:6,width:22,gardens:true}},
  {key:'east-ribbon',x:287,y:294,w:60,d:44,floors:20,accessible:2,archetype:'setback-office',profile:'sandstone-grid',front:'w',verticalSign:{id:'pegasus',mount:'flush',side:'w'}},
  {key:'west-ribbon',x:197,y:164,w:60,d:94,floors:16,accessible:2,archetype:'ribbon-office',profile:'white-ribbon',front:'e'},
  {key:'east-glass',x:287,y:165,w:62,d:91,floors:26,accessible:2,archetype:'curtain-tower',profile:'blue-curtain',front:'w'},
  {key:'west-south',x:196,y:418,w:61,d:83,floors:14,accessible:1,archetype:'ribbon-office',profile:'civic-piers',front:'e'},
  {key:'east-south',x:287,y:420,w:65,d:81,floors:18,accessible:1,archetype:'setback-office',profile:'sandstone-grid',front:'w'},
  // The six-storey housing block has a real double-loaded
  // corridor, apartments, stair cores and an independently finished rear.
  {key:'brick-housing',x:76,y:576,w:90,d:24,floors:6,accessible:3,archetype:'slab',profile:'brick-apartments',front:'n',architecture:'brick-housing'},
  {key:'blue-retail',x:76,y:656,w:90,d:36,floors:4,accessible:2,archetype:'strip-shops',profile:'white-ribbon',front:'n',architecture:'blue-retail',verticalSign:{id:'clinic',mount:'flush',side:'n'}},
  {key:'service-loft',x:76,y:710,w:70,d:52,floors:4,accessible:2,archetype:'workshop',profile:'sandstone-grid',front:'s',architecture:'service-loft'},
  // Four deep waterfront blocks, not freestanding facade planes.
  {key:'quay-west-near',x:654,y:871,w:58,d:52,floors:25,accessible:2,archetype:'curtain-tower',profile:'green-curtain',front:'e',architecture:'canal-portico'},
  {key:'quay-west-annex',x:666,y:829,w:52,d:38,floors:11,accessible:2,archetype:'ribbon-office',profile:'service-wall',front:'e',architecture:'quay-service-wing'},
  {key:'quay-east-near',x:807,y:836,w:96,d:87,floors:22,accessible:2,archetype:'twin-office',profile:'white-ribbon',front:'w',architecture:'ribbon-twins',entrance:{rise:1.5,run:6,width:30,gardens:false}},
  {key:'quay-west-mid',x:658,y:690,w:54,d:103,floors:30,accessible:1,archetype:'curtain-tower',profile:'blue-curtain',front:'e',volumes:[
    {x:0,y:0,w:54,d:103,lo:0,hi:6},
    {x:0,y:0,w:46,d:57,lo:6,hi:63},
    {x:0,y:60,w:54,d:43,lo:6,hi:90},
  ]},
  {key:'quay-east-mid',x:807,y:689,w:78,d:104,floors:19,accessible:2,archetype:'curtain-tower',profile:'blue-curtain',front:'w'},
  {key:'quay-west-far',x:650,y:579,w:62,d:88,floors:16,accessible:1,archetype:'ribbon-office',profile:'white-ribbon',front:'e'},
  {key:'quay-east-far',x:807,y:579,w:74,d:86,floors:17,accessible:1,archetype:'setback-office',profile:'sandstone-grid',front:'w'},
  // Skyline lots occupy real blocks behind the canal bend, with entrances and
  // interiors when approached. They are never camera-facing background cards.
  {key:'skyline-west',x:601,y:418,w:38,d:37,floors:36,accessible:1,archetype:'ribbon-office',profile:'white-ribbon',front:'s'},
  {key:'skyline-east',x:794,y:418,w:36.5,d:37,floors:31,accessible:1,archetype:'curtain-tower',profile:'blue-curtain',front:'s'},
  {key:'skyline-civic',x:834.5,y:473,w:36.5,d:38,floors:8,accessible:2,archetype:'municipal',profile:'sandstone-grid',front:'e'},
  {key:'skyline-slim',x:889,y:377,w:37,d:37,floors:28,accessible:1,archetype:'ribbon-office',profile:'white-ribbon',front:'n'},
  // A second row follows the existing blocks around the bend. Podiums,
  // setbacks and narrow shafts form a skyline without flattening the canal
  // behind a single screen wall. Every lot has a normal street entrance.
  {key:'skyline-step-west',x:601,y:377,w:40,d:30,floors:22,accessible:1,archetype:'setback-office',profile:'sandstone-grid',front:'n',volumes:[
    {x:0,y:0,w:40,d:30,lo:0,hi:18},{x:5,y:4,w:30,d:22,lo:18,hi:51},{x:9,y:7,w:22,d:16,lo:51,hi:66},
  ]},
  {key:'skyline-bend',x:737,y:401,w:28,d:42,floors:26,accessible:1,archetype:'ribbon-office',profile:'white-ribbon',front:'s',volumes:[
    {x:0,y:0,w:28,d:42,lo:0,hi:15},{x:3,y:4,w:22,d:34,lo:15,hi:78},
  ]},
  {key:'skyline-west-podium',x:601,y:473,w:60,d:36,floors:12,accessible:1,archetype:'municipal',profile:'sandstone-grid',front:'s',volumes:[
    {x:0,y:0,w:60,d:36,lo:0,hi:15},{x:10,y:3,w:38,d:30,lo:15,hi:36},
  ]},
  {key:'skyline-east-slab',x:794,y:473,w:28,d:40,floors:18,accessible:1,archetype:'fin-office',profile:'civic-piers',front:'s'},
  {key:'skyline-quay-civic',x:657,y:540,w:54,d:28,floors:8,accessible:1,archetype:'municipal',profile:'sandstone-grid',front:'n'},
  {key:'skyline-quay-white',x:809,y:540,w:70,d:28,floors:7,accessible:1,archetype:'ribbon-office',profile:'white-ribbon',front:'n'},
  {key:'skyline-east-step',x:937,y:425,w:28,d:28,floors:24,accessible:1,archetype:'curtain-tower',profile:'blue-curtain',front:'s',volumes:[
    {x:0,y:0,w:28,d:28,lo:0,hi:24},{x:3,y:3,w:22,d:22,lo:24,hi:72},
  ]},
]

/** World-anchored blending retains the ordinary canal at macro boundaries. */
export function l11ReferenceCanalX(seed:number,stripe:number,y:number,ordinary:number){
  if(seed!==L11_REFERENCE_SEED||stripe!==0)return ordinary
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
  const k=smooth((y-440)/120)*(1-smooth((y-960)/72))
  return ordinary+(760-ordinary)*k
}
export const l11CanalWidth=(seed:number)=>seed===L11_REFERENCE_SEED?40:22

export const l11ReferenceStreet=(seed:number,x:number,y:number)=>seed===L11_REFERENCE_SEED&&(
  x>176&&x<366&&y>156&&y<518||x>50&&x<210&&y>534&&y<642||x>600&&x<922&&y>568&&y<936)
export interface L11ReferenceProp {key:string;x:number;y:number;angle:number;id:string;extra:Record<string,number|string>}
/** Street furniture is a world recipe. The same courts and kerbs remain usable
 * from behind, and vehicles never obstruct the central traffic/pedestrian routes. */
export const L11_REFERENCE_PROPS:L11ReferenceProp[]=(()=>{
  const out:L11ReferenceProp[]=[]
  const add=(key:string,x:number,y:number,angle=0,extra:Record<string,number|string>={})=>out.push({key,x,y,angle,id:`reference:${key}:${x}:${y}`,extra})
  for(const side of [-1,1]){
    const x=272+side*11.3,face=side<0?Math.PI/2:-Math.PI/2
    for(const y of [180,192,204,216,228,240,302,314,326,338,350,362,374,386,436,448,460,472,484,496])add('plane_tree',x,y,y*.17+side)
    for(const y of [202,251,312,377,452,496])add('streetlight',272+side*10.55,y,face)
    for(const y of [294,389,421]){add('signal',272+side*10.6,y,side<0?0:Math.PI,y===389&&side>0?{signId:'hope'}:{});add('pedestrian_signal',272+side*11.9,y-1.6,face)}
    for(const y of [307,379,441])add('hydrant',272+side*10.6,y,face)
    for(const y of [317,372,476]){add('parking_meter',272+side*10.6,y,face);add('storm_drain',272+side*9.6,y,Math.PI/2,{mount:.023,roadInset:1})}
    for(const y of [318,374,483])add('sedan',272+side*8.45,y,side<0?Math.PI:0)
    add('trash_bin',272+side*12.1,362,face)
    add('newspaper_box',272+side*12.3,382,face)
  }
  add('manhole',269,398,0,{mount:.023,roadInset:1})
  add('taxi',280.45,227,0)
  // A small, fenced utilities repair on the apartment street, with a public
  // bus stop and parked resident cars. The entire front door route stays clear.
  for(const [x,style] of [[77,0],[131,1],[141,2],[155,0]])add('sedan',x,566.8,Math.PI/2,{style})
  add('bus_shelter',108,572.4,0);add('bus_stop',111,571.1,0);add('trash_bin',105,571,0)
  for(const x of [72,91,146,177])add('streetlight',x,570.1,0)
  for(const x of [89,91,93,95,97,99,101])add('safety_fence',x,571.8,0)
  for(const y of [572.8,574.8]){add('safety_fence',88,y,Math.PI/2);add('safety_fence',102,y,Math.PI/2)}
  add('cable_reel',90,574);add('pallet_stack',93,574);add('cement_mixer',96,574,Math.PI/2)
  add('pallet',99,574)
  for(const x of [87,103])add('road_barrier',x,571,0)
  for(const x of [86,104])add('cone',x,570.3,0)
  for(const x of [71,110,149,174]){add('plane_tree',x,607);add('park_bench',x+3,605.5,Math.PI)}
  // Quays retain an open promenade, a tree/plaza strip and a service road.
  for(const side of [-1,1])for(const y of [848,872,898,916,704,729,757,783,601,632,654]){
    const x=760+side*39
    add('plane_tree',x,y,y*.17+side)
    add('shrub_planter',x,y+3,Math.PI/2)
    if(y%2===0)add('park_bench',760+side*27,y,side<0?Math.PI/2:-Math.PI/2)
    if(y%3===0)add('park_lamp',760+side*25,y)
  }
  add('life_ring',738.7,866,Math.PI/2);add('life_ring',781.3,891,-Math.PI/2)
  return out
})()
