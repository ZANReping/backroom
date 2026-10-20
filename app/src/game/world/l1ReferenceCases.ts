import type {L1Module,V3} from './l1BuildingTypes'

/** world is relative to anchor centre in Three.js [x,height,z] metres.
 * image points are manual source-image annotations (about 1% reading uncertainty). */
export interface L1ReferenceLandmark {id:string;world:V3;image:[number,number];kind:'column'|'wall'|'beam'|'light'|'prop';profile?:{center:V3;radius:number;side:'left'|'right'}}
/** Photo segments belonging to a world-parallel family; endpoints need not be
 * particular mesh vertices. These constrain lens orientation independently of position. */
export interface L1ReferenceParallel {id:string;axis:0|1|2;from:[number,number];to:[number,number]}
export interface L1ReferenceCase {
 module:Partial<L1Module>; camera?:[number,number,number,number,number,number,number?]
 /** Normalized source-image regions; do not score clipped lamps as wall luminance. */
 regions:{name:string;rect:[number,number,number,number]}[]
 landmarks:L1ReferenceLandmark[]
 parallels?:L1ReferenceParallel[]
 /** Relative XZ wall volumes. These are actual collision/bake surfaces, including backs. */
 partitions?:{min:[number,number];max:[number,number]}[]
}
// Corresponding architectural features, not automatically chosen nearest pixels.
// Large projected errors deliberately remain visible to the comparison report.
const marks:Record<string,L1ReferenceLandmark[]>={
 'parking-common':[
  {id:'near-column-foot',world:[-5.2,0,1.6],image:[.305,.745],kind:'column'},
  {id:'near-column-beam-joint',world:[-5.2,2.55,1.6],image:[.305,.486],kind:'beam'},
  {id:'next-column-foot',world:[-5.2,0,-4.8],image:[.502,.681],kind:'column'}],
 'parking-round':[
  {id:'left-round-foot',world:[-2.5,0,-1.2],image:[.303,.478],kind:'column'},
  {id:'left-round-head',world:[-2.5,3.23,-1.2],image:[234/835,77/617],kind:'beam'},
  {id:'next-post-foot',world:[-2.5,0,-7.2],image:[341/835,250/617],kind:'column'},
  {id:'third-post-foot',world:[-2.5,0,-13.2],image:[418/835,220/617],kind:'column'}],
 'parking-room':[
  {id:'room-left-wall-foot',world:[-3,0,5],image:[.311,.832],kind:'wall'},
  {id:'room-opening-post-foot',world:[-1.3,0,4.35],image:[.506,.793],kind:'column'},
  {id:'room-opening-post-head',world:[-1.3,2.7,4.35],image:[.506,.312],kind:'beam'}],
 'parking-water':[
  {id:'left-column-foot',world:[-3.2,0,-8.2],image:[.289,.355],kind:'column'},
  {id:'near-right-column-foot',world:[3,0,-2],image:[.85,.506],kind:'column'}],
 'parking-bright':[
  {id:'white-column-foot',world:[6.5,0,-8],image:[.700,.558],kind:'column'},
  {id:'white-column-head',world:[6.5,2.83,-8],image:[.700,.225],kind:'beam'}],
 'parking-clean':[
  {id:'middle-column-foot',world:[0,0,-6.3],image:[.407,.605],kind:'column'},
  {id:'next-column-foot',world:[0,0,-12.1],image:[.634,.538],kind:'column'}],
 'parking-dry':[
  {id:'right-wall-corner-foot',world:[8,0,3],image:[.634,.709],kind:'wall'},
  {id:'right-wall-corner-head',world:[8,3.13,3],image:[.634,.22],kind:'wall'}],
 'parking-dim':[
  {id:'left-column-foot',world:[-2.5,0,-3],image:[.204,.672],kind:'column'},
  {id:'right-column-foot',world:[4.3,0,-3],image:[.647,.673],kind:'column'},
  {id:'left-column-beam-joint',world:[-2.5,3.53,-3],image:[.204,.328],kind:'beam'}],
 'parking-dark':[
  {id:'central-column-foot',world:[-1.5,0,-3],image:[.493,.617],kind:'column'},
  {id:'far-column-foot',world:[5.3,0,-10],image:[.593,.579],kind:'column'}],
 'parking-props':[
  {id:'rear-wall-floor',world:[0,0,-7],image:[.5,.508],kind:'wall'},
  {id:'rear-wall-ceiling',world:[0,3.1,-7],image:[.5,.322],kind:'wall'},
  {id:'left-column-foot',world:[-4.8,0,-2.125],image:[.114,.592],kind:'column'},
  {id:'right-column-foot',world:[5.2,0,-2.125],image:[.809,.608],kind:'column'}],
 storage:[
  {id:'left-steel-post-foot',world:[-4.5,0,6.5],image:[.170,.683],kind:'column'},
  {id:'middle-steel-post-foot',world:[-4.5,0,-3],image:[.491,.672],kind:'column'},
  {id:'third-steel-post-foot',world:[-4.5,0,-12.5],image:[.642,.669],kind:'column'}],
 gothic:[
  {id:'near-column-left-springing',world:[-1.397,1.7184,-1],image:[.077,.74],kind:'column',profile:{center:[-1,1.7184,-1],radius:.397,side:'left'}},
  {id:'near-column-right-springing',world:[-.603,1.7184,-1],image:[.335,.74],kind:'column',profile:{center:[-1,1.7184,-1],radius:.397,side:'right'}},
  {id:'next-column-foot',world:[-1,0,-7],image:[.45,.667],kind:'column'},
  {id:'right-column-foot',world:[5,0,-7],image:[.835,.718],kind:'column'},
  {id:'right-column-springing',world:[5,1.7184,-7],image:[.835,.501],kind:'column'}],
 ouroboros:[
  {id:'near-column-foot',world:[4.8,0,-2],image:[.773,.91],kind:'column'},
  {id:'near-column-head',world:[4.8,4.25,-2],image:[.773,.02],kind:'column'}],
 garden:[
  {id:'left-front-column-foot',world:[-2,0,-7.2],image:[.221,.604],kind:'column'},
  {id:'right-front-column-foot',world:[5.2,0,0],image:[.974,.933],kind:'column'}],
 'path-corridor':[
  {id:'left-wall-floor-at-crossing',world:[-2,0,0],image:[.315,.664],kind:'wall'},
  {id:'right-wall-floor-at-crossing',world:[0,0,0],image:[.675,.673],kind:'wall'}],
 'path-room':[
  {id:'rear-left-ceiling-corner',world:[1,3.4,3],image:[.364,.181],kind:'wall'},
  {id:'rear-right-ceiling-corner',world:[3,3.4,3],image:[.664,.177],kind:'wall'},
  {id:'rear-right-floor-corner',world:[3,0,3],image:[.664,.568],kind:'wall'}],
 crate:[
  {id:'stack-upper-left-front',world:[-.14,1.36,-.145],image:[.005,.134],kind:'prop'},
  {id:'stack-upper-right-front',world:[1.14,1.36,-.145],image:[.964,.128],kind:'prop'},
  {id:'stack-middle-left-front',world:[-.14,.68,-.145],image:[.026,.585],kind:'prop'},
  {id:'stack-middle-right-front',world:[1.14,.68,-.145],image:[.945,.633],kind:'prop'}],
 'power-out':[
  {id:'central-column-foot',world:[-.3,0,.1],image:[.556,.65],kind:'column'},
  {id:'central-column-head',world:[-.3,2.85,.1],image:[.556,.394],kind:'column'}],
}
const regions=[{name:'floor',rect:[.3,.78,.35,.13] as [number,number,number,number]},{name:'ceiling',rect:[.25,.08,.35,.15] as [number,number,number,number]}]
const entry=(module:Partial<L1Module>,camera?:L1ReferenceCase['camera']):L1ReferenceCase=>({module,camera,regions:regions.map(r=>({...r})),landmarks:[]})
/** Measured proportions are authored as real building parameters, not renderer overrides.
 * All eighteen cases use the same modules, collision and bake as procedural districts. */
export const L1_REFERENCE_CASES:Record<string,L1ReferenceCase>={
 'parking-common':entry({height:2.8,spacingX:10,spacingZ:6.4,phaseX:-5.2,phaseZ:1.6,columnWidth:1.05,columnDepth:1.25,beamDepth:.25,wallTubes:true,serviceOffset:.44,power:1.4},[-.0573,9.3037,.0384,.3291,.0868,55.9277,.0084]),
 'parking-round':entry({height:3.5,spacingX:6.4,spacingZ:6,phaseX:-2.5,phaseZ:-1.2,columnWidth:.7,columnDepth:.7,round:true,columnPattern:'mixed',wallTubes:false,lighting:'wall-tubes',services:'red-rack',power:1.0},[1.4838,6.7814,.2004,.1737,-.2386,58.3555,-.0462]),
 'parking-room':entry({height:3.15,spacingX:6.5,spacingZ:7.5,phaseX:-1.3,phaseZ:4.35,columnWidth:.65,columnDepth:.65,beamDepth:.45,wallTubes:true,tubeSide:-1,power:1.1},[-3.9586,9.0908,-.5,-.498,.1011,56.8945]),
 'parking-water':entry({height:3.25,spacingX:6.2,spacingZ:6.2,phaseX:-3.2,phaseZ:-2,columnWidth:1.05,columnDepth:.9,wallTubes:true,power:1.8},[.6867,3.0061,-.2057,.0435,-.2616,53.0557]),
 'parking-bright':entry({height:3.1,spacingX:7,spacingZ:6,phaseX:-.5,phaseZ:-2,columnWidth:1.1,columnDepth:1.1,power:2.0,finish:'paint'},[3.0958,.9717,-.2578,-.1288,-.0843,49.3826]),
 'parking-clean':entry({height:3.5,spacingX:5.8,spacingZ:5.8,phaseX:0,phaseZ:-.5,columnWidth:.7,columnDepth:.7,power:2.8,finish:'paint'},[4.9278,-.1806,-.2083,.5602,-.0686,51.6729]),
 'parking-dry':entry({height:3.4,spacingX:7.4,spacingZ:7.4,columnWidth:.8,columnDepth:.8,wallTubes:false,power:.85},[6.0427,8.2683,-.1276,-.0809,-.0144,61.2728]),
 'parking-dim':entry({height:3.8,spacingX:6.8,spacingZ:7,phaseX:-2.5,phaseZ:-3,columnWidth:1.2,columnDepth:.8,wallTubes:false,power:2.4,lighting:'service-bay',services:'service-rack',serviceOffset:.51,serviceDrop:.32,serviceLight:{offsetX:.48,offsetZ:-1.5,drop:.06,range:32,alongZ:true}},[2.5322,11.1027,-.0495,.0386,.0216,42.5875,.0026]),
 'parking-dark':entry({height:3.05,spacingX:6.8,spacingZ:7,phaseX:-1.5,phaseZ:-3,columnWidth:1.1,columnDepth:.8,wallTubes:true,power:.48},[-4.5471,7.0716,-.0246,-.3106,.0575,82.1525]),
 'parking-props':entry({height:3.1,spacingX:10,spacingZ:8,phaseX:-4.8,phaseZ:-2.5,columnWidth:.85,columnDepth:.75,beamDepth:.28,wallTubes:false,lighting:'wall-bay',wallFinish:'brick',power:.42},[1.4223,5.6225,.5,.08,-.1368,66.528,.0069]),
 storage:entry({height:6.2,spacingX:18,spacingZ:9.5,phaseX:-4.5,columnWidth:.38,columnDepth:.38,beamDepth:1.1,lampSpacing:7,power:3.5,finish:'raw'},[8.2328,12.8875,-1.1933,.6645,.1619,55.3591]),
 gothic:entry({height:3.65,spacingX:6,spacingZ:6,phaseX:-1,phaseZ:-1,columnWidth:.794,columnDepth:.794,springHeight:1.7184,round:true,power:1.55,lampPhaseX:.86,lampPhaseZ:.18,lampAlongZ:true},[.2957,1.078,1.0016,.0574,-.0983,61.2543,.0236]),
 ouroboros:entry({height:4.25,spacingX:6.8,spacingZ:6,phaseX:-2,phaseZ:-2,columnWidth:.7,columnDepth:.75,beamDepth:.6,finish:'peeling',power:1.7},[2.921,2.26,.4071,.1754,.0002,63.6509]),
 garden:entry({height:7.8,spacingX:7.2,spacingZ:7.2,phaseX:-2,phaseZ:0,columnWidth:1.65,columnDepth:1.65,power:5.5},[2.2691,2.0895,-.1062,-.1282,-.0353,64.2096]),
 'path-corridor':entry({height:2.65,power:.95},[-.598,4.5637,-.1069,.0782,-.1097,60.8847]),
 'path-room':entry({height:3.4,power:.50},[2.4942,10.60,-.3118,.0758,-.0832,60.417]),
 crate:entry({height:6.2,power:1.6},[1.2589,2.051,-.3571,.3028,-.1533,35.0006,.0019]),
 'power-out':entry({height:3.12,spacingX:6.8,spacingZ:6.4,columnWidth:1.05,columnDepth:1.25,wallTubes:true,power:1.4},[.0723,7.6441,-.0214,.1595,.0182,73.1285]),
}
for(const [id,landmarks]of Object.entries(marks))L1_REFERENCE_CASES[id].landmarks=landmarks

// Original common photograph: 800×600. Long straight edges constrain the lens
// without treating the apparent position of a shadow as a building edge.
L1_REFERENCE_CASES['parking-common'].parallels=[
 {id:'near-pier-left-edge',axis:1,from:[204/800,302/600],to:[201/800,445/600]},
 {id:'middle-pier-left-edge',axis:1,from:[376/800,333/600],to:[375/800,402/600]},
 {id:'front-cross-pipe',axis:0,from:[14/800,210/600],to:[775/800,139/600]},
 {id:'rear-cross-pipe',axis:0,from:[64/800,278/600],to:[714/800,247/600]},
 {id:'longitudinal-ceiling-pipe',axis:2,from:[280/800,101/600],to:[554/800,320/600]},
]
// Original round-column photograph: 835×617. Avoid curved bends at image edges.
L1_REFERENCE_CASES['parking-round'].parallels=[
 {id:'near-column-left-edge',axis:1,from:[215/835,66/617],to:[241/835,290/617]},
 {id:'next-post-left-edge',axis:1,from:[313/835,104/617],to:[328/835,247/617]},
 {id:'rear-post-left-edge',axis:1,from:[400/835,139/617],to:[407/835,218/617]},
 {id:'right-wall-floor',axis:2,from:[748/835,389/617],to:[557/835,220/617]},
 {id:'column-row-floor',axis:2,from:[255/835,297/617],to:[418/835,220/617]},
 {id:'ceiling-longitudinal-beam',axis:2,from:[270/835,78/617],to:[430/835,128/617]},
]
// Dim bay: readable pier edges and the two straight longitudinal service runs.
// Shadows are deliberately excluded: they do not define architectural axes.
L1_REFERENCE_CASES['parking-dim'].parallels=[
 {id:'left-pier-inner-edge',axis:1,from:[.2325,.337],to:[.2325,.643]},
 {id:'rear-left-pier-edge',axis:1,from:[.347,.397],to:[.347,.596]},
 {id:'right-pier-inner-edge',axis:1,from:[.602,.343],to:[.602,.623]},
 {id:'front-cross-beam',axis:0,from:[.238,.332],to:[.599,.327]},
 {id:'left-longitudinal-tray',axis:2,from:[.314,.240],to:[.465,.435]},
 {id:'right-longitudinal-pipe',axis:2,from:[.571,.280],to:[.550,.434]},
]
L1_REFERENCE_CASES['parking-dim'].partitions=[
 {min:[3.7,3.6],max:[4.0,24]},
 {min:[3.7,3.6],max:[7,4.1]},
]
