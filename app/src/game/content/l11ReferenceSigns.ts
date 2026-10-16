/** Architectural sign assembly, registered before use by the reference district.
 * The complete generated face is not counted as a new decor prototype. */
export const L11_REFERENCE_BANNER={
  id:'pegasus-building-banner',width:2.3,height:14,depth:.12,
  collision:'building-solid',placement:'building-facade-flush-or-blade',interaction:null,container:false,
  mount:'l11VerticalSignMount: volume-aware facade placement',
  albedo:'l11-inspected-pegasus.png',lowAlbedo:'l11-inspected-pegasus_low.png',
  normal:'l11-inspected-pegasus_normal.png',roughness:'l11-inspected-pegasus_roughness.png',
  source:'assets/l11-reference-signs-v2/manifest.json',
} as const

/** Small reference-scene signs whose visible wording and silhouettes were checked against 11iconic. */
export const L11_INSPECTED_SIGNS = [
  {
    id:'hope', width:1.25, height:.44, depth:.16, shape:'rectangle', text:'Hope',
    albedo:'l11-inspected-hope.png', lowAlbedo:'l11-inspected-hope_low.png',
    normal:'l11-inspected-hope_normal.png', roughness:'l11-inspected-hope_roughness.png',
    source:'assets/l11-reference-signs-v2/manifest.json', collision:'assembly-solid',
    placement:'street-or-signal', interaction:null, container:false,
  },
  {
    id:'famima', width:2.8, height:.58, depth:.055, shape:'rectangle', text:'Famima!!',
    albedo:'l11-inspected-famima.png', lowAlbedo:'l11-inspected-famima_low.png',
    normal:'l11-inspected-famima_normal.png', roughness:'l11-inspected-famima_roughness.png',
    source:'assets/l11-reference-signs-v2/manifest.json', collision:'assembly-solid',
    placement:'shop-fascia', interaction:null, container:false,
  },
  {
    id:'famima-round', width:.68, height:.68, depth:.1, shape:'circle', text:'Famima!!',
    albedo:'l11-inspected-famima-round.png', lowAlbedo:'l11-inspected-famima-round_low.png',
    normal:'l11-inspected-famima-round_normal.png', roughness:'l11-inspected-famima-round_roughness.png',
    source:'assets/l11-reference-signs-v2/manifest.json', collision:'assembly-solid',
    placement:'shop-projecting', interaction:null, container:false,
  },
] as const
