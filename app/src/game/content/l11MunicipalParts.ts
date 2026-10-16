import { L11PropBuilder } from './l11PropKit'

/** Detailed, reusable meshes for the twenty municipal Level 11 props. */
export function l11MunicipalParts(key: string, b: L11PropBuilder): boolean {
  const { w, d, height: H } = b.def
  const pole = (x = 0, z = 0, h = H, r = .045, color = '#4b5050') => b.cylinder(x, h / 2, z, r, h, 'metal', color)
  switch (key) {
    case 'signal': {
      pole(0, 0, H, .065, '#7a8581')
      b.cylinder(0,.06,0,.19,.12,'metal','#606c69')
      // A raised mast arm carries the head over the approach lane; the whole
      // assembly is three-dimensional and shares its collision triangles.
      b.bar([0,H-.7,0],[.9,H-.28,0],.045,'metal','#82908b')
      b.bar([.9,H-.28,0],[2.6,H-.17,0],.04,'metal','#82908b')
      b.bar([2.6,H-.17,0],[2.6,H-.64,0],.035,'metal','#82908b')
      b.box(2.6,H-.85,0,.38,1.0,.22,'paint','#bba454')
      b.box(2.6,H-.85,-.125,.31,.93,.035,'rubber','#202728')
      for(const [i,c] of ['#ed382c','#65552b','#2f4d37'].entries()){
        const y=H-.55-i*.29
        b.cylinder(2.6,y,-.16,.102,.035,'paint',c,false).rx=Math.PI/2
        b.box(2.6,y+.115,-.21,.26,.028,.22,'metal','#303333',false)
        for(const x of [2.48,2.72])b.box(x,y+.035,-.2,.022,.16,.20,'metal','#303333',false)
      }
      return true
    }
    case 'pedestrian_signal': {
      pole(0, 0, H, .04); b.box(0, 2.3, 0, .2, .32, .2, 'paint', '#202326'); b.panel(0, 2.39, -.105, .08, .07, 'glass', '#f4f2da'); b.panel(0, 2.29, -.105, .08, .07, 'glass', '#55b66b'); b.box(0,2.48,.11,.16,.05,.04,'metal'); return true
    }
    case 'streetlight': { pole(0, 0, H, .055); b.bar([0,H-.28,0],[0,H-.15,-.74],.035); b.box(0,H-.16,-.8,.27,.11,.48,'metal'); b.panel(0,H-.219,-.8,.22,.4,'paint','#e6e2cf').rx=Math.PI/2; b.cylinder(0,.04,0,.18,.08,'metal'); for(const x of [-.1,.1]) b.cylinder(x,.1,0,.018,.03,'metal') ; return true }
    case 'bollard': { b.cylinder(0, H / 2, 0, .1, H, 'metal', '#555b59'); b.cylinder(0, .04, 0, .16, .08, 'metal'); b.cylinder(0, H*.64,0,.105,.06,'paint','#e4e2d2'); return true }
    case 'hydrant': { b.cylinder(0, .34, 0, .14, .65, 'paint', '#c44737'); b.sphere(0, .7, 0, .25, .18, .25, 'paint', '#c44737', true); for(const x of [-.14,.14]){const q=b.cylinder(x,.42,0,.1,.1,'metal','#d3c7a5');q.rz=Math.PI/2} b.cylinder(0,.78,0,.045,.04,'metal','#b9baa4');b.cylinder(0,.035,0,.18,.07,'paint','#a84232');for(const x of [-.15,.15])b.cylinder(x,.077,0,.018,.016,'metal','#b9baa4',false); b.ring(0,.62,0,.145,.018,'metal','#8e3028').rx=Math.PI/2; return true }
    case 'parking_meter': { pole(0, 0, 1.05, .035); b.box(0, 1.13, 0, .25, .4, .18, 'metal', '#4a4d4c'); b.box(0, 1.23, -.095, .13, .1, .02, 'glass', '#b7c9c4', false); b.box(0, 1.03, -.1, .08, .02, .025, 'metal'); return true }
    case 'road_sign': { pole(0, 0, H, .035); b.cylinder(0, H - .3, 0, .21, .04, 'paint', '#b7352f', true).rx = Math.PI / 2; b.box(0, H - .3, -.03, .25, .035, .02, 'paint', '#e9e3c5', false); return true }
    case 'street_name': { pole(0, 0, H, .035); b.box(-.42, H - .2, 0, .8, .17, .04, 'paint', '#315b66'); b.box(.42, H - .2, 0, .8, .17, .04, 'paint', '#315b66'); return true }
    case 'utility_box': { b.box(0, .55, 0, .75, 1.1, .35, 'metal', '#68706d'); b.box(0, .6, -.185, .58, .7, .02, 'paint', '#555b59', false); b.box(.18, .6, -.2, .035, .07, .02, 'metal'); for (let i = 0; i < 6; i++) b.box(-.2 + i * .08, .88, -.2, .04, .025, .02, 'metal', '#242827', false); return true }
    case 'transformer': { b.box(0, .05, 0, 1.5, .1, 1, 'concrete'); b.box(0, .75, 0, 1.15, 1.4, .75, 'metal', '#69706c'); for (const x of [-.32, .32]) { for (let i = 0; i < 3; i++) b.ring(x, 1.48 + i * .11, 0, .1 - i * .015, .04, 'porcelain', '#e5dfc5', false).rx=Math.PI/2; b.cylinder(x, 1.42, 0, .055, .16, 'metal') } return true }
    case 'bus_shelter': { for (const x of [-w / 2 + .12, w / 2 - .12]) for (const z of [-d / 2 + .12, d / 2 - .12]) b.box(x, H / 2, z, .08, H, .08, 'metal'); b.box(0, H - .08, 0, w, .16, d, 'metal'); b.panel(0,H/2,d/2-.04,w,H-.2,'glass','#9bb8bd'); b.slats(w-.5,.45,.58,4,'wood'); b.legs(w-.5,.45,.55); b.panel(w/2-.04,.9,0,1.3,.7,'glass','#315b66').ry=Math.PI/2; return true }
    case 'bus_stop': { pole(0, 0, H, .035); b.box(0, H - .22, 0, .5, .3, .08, 'paint', '#315b66'); b.panel(0,H-.62,-.02,.3,.7,'paper','#d8d7bd'); b.box(0,H-.62,.02,.34,.74,.025,'metal','#315b66',false); return true }
    case 'bike_rack': { for (const x of [-.65, 0, .65]) { b.cylinder(x - .22, .35, 0, .035, .7, 'metal'); b.cylinder(x + .22, .35, 0, .035, .7, 'metal'); b.box(x, .7, 0, .48, .07, .07, 'metal') } return true }
    case 'trash_bin': { b.cylinder(0, .45, 0, .26, .9, 'metal', '#53605e'); b.cylinder(0,.93,0,.28,.06,'metal'); b.cylinder(0,.965,-.01,.11,.01,'rubber','#202624',false); b.box(0,.7,-.26,.22,.08,.025,'rubber','#202624',false); for(let i=0;i<12;i++){const a=i*Math.PI/6;b.bar([Math.cos(a)*.263,.14,Math.sin(a)*.263],[Math.cos(a)*.263,.79,Math.sin(a)*.263],.007,'metal','#384a44',false)} return true }
    case 'recycling_bin': { for (const [x, c] of [-.4, 0, .4].map((x, i) => [x, ['#4c7eaa', '#5d9b63', '#c49a43'][i]] as [number, string])) { b.box(x, .52, 0, .34, 1.04, .55, 'metal', c); b.box(x, 1.08, 0, .36, .08, .57, 'paint', c); b.box(x, .98, -.29, .16, .08, .025, 'metal', '#202624', false) } return true }
    case 'post_box': { b.box(0, .5, 0, .15, 1, .15, 'metal'); b.box(0, 1.05, 0, .6, .65, .5, 'paint', '#3c5961'); b.sphere(0, 1.38, 0, .6, .25, .5, 'paint', '#3c5961', true); b.box(0, 1.22, -.26, .2, .04, .025, 'metal', '#202624', false); return true }
    case 'manhole': { b.cylinder(0,.012,0,.35,.025,'metal','#4d5553',false); b.ring(0,.018,0,.35,.012,'metal','#222827',false).rx=Math.PI/2; for(let i=0;i<4;i++) b.box(0,.028,-.2+i*.13,.5,.008,.025,'metal','#222827',false); return true }
    case 'storm_drain': { b.box(0, .012, 0, w, .025, d, 'metal', '#4d5553', false); for (let i = 0; i < 8; i++) b.box(-w / 2 + (i + .5) * w / 8, .03, 0, .025, .01, d * .8, 'metal', '#222827', false); return true }
    case 'traffic_island': { b.box(0,.08,0,w*.9,.16,d*.9,'concrete','#9a9b91',false); b.box(0,.19,-d*.4,.05,.18,.03,'paint','#e3b52f',false); return true }
    case 'ticket_machine': { b.box(0, .85, 0, .6, 1.7, .5, 'metal', '#5d6664'); b.box(0, 1.35, -.27, .4, .25, .03, 'glass', '#b7c9c4', false); b.box(0, .9, -.28, .18, .03, .025, 'metal', '#202624', false); b.box(0, .55, -.28, .24, .08, .025, 'metal', '#d3c7a5', false); for (let i = 0; i < 3; i++) b.cylinder(-.1 + i * .1, .75, -.29, .025, .02, 'paint', '#c44737', false).rx = Math.PI / 2; return true }
    default: return false
  }
}
