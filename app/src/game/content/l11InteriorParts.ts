import { L11PropBuilder } from './l11PropKit'

/** Purpose-built interior prop parts for Level 11. Coordinates are metres. */
export function l11InteriorParts(key: string, b: L11PropBuilder): boolean {
  const { w, d, height: H } = b.def
  const legs = (n: number, lw = .07, lh = H * .72, surface: 'metal'|'wood' = 'metal') => { for (let i = 0; i < n; i++) { const x = n === 4 ? (i % 2 ? w / 2 - lw : -w / 2 + lw) : 0; const z = n === 4 ? (i > 1 ? d / 2 - lw : -d / 2 + lw) : 0; b.box(x, lh / 2, z, lw, lh, lw, surface) } }
  switch (key) {
    case 'office_desk': { b.box(0,H-.04,0,w,.08,d,'wood');legs(4,.06,H-.08,'metal');b.box(w/2-.22,.34,0,.35,.68,d-.1,'wood');for(let i=0;i<3;i++){b.box(w/2-.22,.15+i*.20,-d/2-.01,.31,.17,.024,'wood');b.box(w/2-.22,.17+i*.20,-d/2-.03,.11,.018,.025,'metal')}b.box(.12,H+.04,.12,.26,.045,.18,'plastic','#484f4a');b.bar([.12,H+.06,.12],[.12,H+.26,.12],.025,'metal');b.box(.12,H+.3,.12,.61,.36,.045,'plastic','#31383a');b.panel(.12,H+.3,.093,.54,.29,'sealedglass','#91a8ab');b.box(.12,H+.022,-.17,.43,.035,.15,'plastic','#c6c3b1');for(let j=0;j<3;j++)b.box(.12,H+.041,-.215+j*.035,.37,.005,.014,'plastic','#656f69',false);return true }
    case 'task_chair': { for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*.265,z=Math.sin(a)*.265;b.bar([0,.13,0],[x,.08,z],.023,'metal');b.cylinder(x,.04,z,.04,.06,'rubber').rz=Math.PI/2}b.cylinder(0,.3,0,.04,.36,'metal');b.box(0,.50,0,.52,.1,.49,'fabric','#bbc8c1');b.box(0,.85,.23,.49,.48,.085,'fabric','#bbc8c1');b.bar([0,.38,.16],[0,.89,.27],.022,'metal');for(const x of [-.295,.295]){b.bar([x,.49,.13],[x,.72,.13],.018,'metal');b.box(x,.73,0,.055,.04,.31,'plastic','#48534f')}return true }
    case 'meeting_table': b.box(0, H - .1, 0, w - .2, .2, d, 'wood'); b.cylinder(-(w - .2) / 2, H - .1, 0, .1, .2, 'wood'); b.cylinder((w - .2) / 2, H - .1, 0, .1, .2, 'wood'); b.box(-w / 3, .38, 0, .18, .7, .35, 'metal'); b.box(w / 3, .38, 0, .18, .7, .35, 'metal'); for (const x of [-w / 2 + .2, w / 2 - .2]) for (const z of [-d / 2 + .1, d / 2 - .1]) b.box(x, .03, z, .1, .06, .1, 'metal'); return true
    case 'file_cabinet': b.box(0, H / 2, 0, w, H, d, 'metal'); { const drawerH=(H-.16)/4; for (let i=0;i<4;i++){const y=.08+drawerH*(i+.5); b.box(0,y,-d/2-.01,w-.08,drawerH-.03,.025,'paint','#68706c'); b.panel(0,y,-d/2-.03,.12,.045,'paper','#e4e0c9'); b.bar([-.09,y+.06,-d/2-.05],[.09,y+.06,-d/2-.05],.014,'metal') } } return true
    case 'bookcase': b.box(-w / 2 + .08, H / 2, 0, .16, H, d, 'wood'); b.box(w / 2 - .08, H / 2, 0, .16, H, d, 'wood'); b.box(0,H/2,d/2-.06,w,H,.1,'wood'); for(let i=0;i<5;i++){const y=.25+i*(H-.35)/5;b.box(0,y,0,w,.08,d,'wood');for(let j=0;j<5;j++){const x=-w/2+.25+j*.35, bh=.3+(j%2)*.08;b.box(x,y+.16,-.05,.2,bh,.25,'paper',j%2?'#7a5340':'#4c6971');b.box(x,y+.16,-.18,.2,bh+.03,.015,'paper',j%2?'#6f4a3a':'#415c63')}} return true
    case 'reception_desk': b.box(0, H / 2, -d / 2, w, H, .18, 'wood'); b.box(-w / 2, H / 2, 0, .18, H, d, 'wood'); b.box(w / 2, H / 2, 0, .18, H, d, 'wood'); b.box(0, H + .08, -d / 2, w + .1, .16, .3, 'concrete'); b.box(0, .75, d / 4, w - .3, .12, d / 2, 'wood'); return true
    case 'sofa': {
      for(const x of [-w*.36,w*.36])for(const z of [-d*.32,d*.32])b.box(x,.1,z,.09,.2,.09,'wood')
      b.box(0,.27,0,w-.2,.25,d-.08,'fabric','#becabb')
      for(let i=0;i<3;i++){const x=(i-1)*w*.29;b.box(x,.47,-.04,w*.28,.16,d*.75,'fabric','#d4d7c5');b.box(x,.535,-d*.35,w*.27,.012,.012,'fabric','#616b65',false);b.box(x,H*.75,d*.37,w*.28,H*.46,.14,'fabric','#b8c6b5')}
      for(const x of [-w/2+.08,w/2-.08])b.box(x,.51,0,.16,.48,d,'fabric','#b2c3b1')
      return true
    }
    case 'armchair': {
      for(const x of [-w*.35,w*.35])for(const z of [-d*.33,d*.33])b.box(x,.1,z,.08,.2,.08,'wood')
      b.box(0,.35,0,w*.76,.28,d*.85,'fabric','#bfb394');b.box(0,.48,-.04,w*.7,.12,d*.7,'fabric','#ded1b0')
      b.box(0,H*.73,d*.37,w*.8,H*.52,.14,'fabric','#bfb394');for(const x of [-w*.43,w*.43])b.box(x,.52,0,w*.14,.35,d*.91,'fabric','#bfb394')
      b.box(0,.54,-d*.38,w*.68,.012,.012,'fabric','#625f51',false)
      return true
    }
    case 'coffee_table': b.box(0, H - .08, 0, w, .16, d, 'wood'); legs(4, .06, H * .7, 'wood'); b.box(0, .25, 0, w - .25, .07, d - .25, 'wood'); return true
    case 'bed': {
      for(const x of [-w*.42,w*.42])for(const z of [-d*.43,d*.43])b.box(x,.15,z,.09,.3,.09,'wood')
      b.box(0,.31,0,w,.13,d,'wood');b.box(0,.45,-.02,w-.05,.16,d-.09,'fabric','#d7d1bd')
      b.box(0,.538,-.2,w-.06,.028,d*.72,'fabric','#8a9a91');b.box(0,.557,d*.14,w-.06,.025,.15,'fabric','#b0b8a3')
      for(const x of [-w*.24,w*.24])b.sphere(x,.58,d*.32,w*.41,.14,d*.2,'fabric','#e5dfcf')
      b.box(0,.49,d/2-.045,w,.9,.09,'wood').grain='y'
      return true
    }
    case 'wardrobe': b.box(0,H/2,0,w,H,d,'wood'); b.box(-w/4,H/2,-d/2-.02,w/2-.02,H-.12,.03,'wood'); b.box(w/4,H/2,-d/2-.02,w/2-.02,H-.12,.03,'wood'); b.box(0,H/2,-d/2-.04,.025,H-.2,.02,'metal'); b.cylinder(-.12,H/2,-d/2-.06,.025,.08,'metal'); b.cylinder(.12,H/2,-d/2-.06,.025,.08,'metal'); return true
    case 'kitchen_counter': b.box(0, .42, 0, w, .84, d, 'wood'); for (let i = 0; i < 3; i++) b.box(-w / 3 + i * w / 3, .42, -d / 2 - .02, w / 3 - .04, .55, .03, 'paint', '#65706d'); b.box(0, .88, 0, w + .08, .12, d + .05, 'concrete'); b.box(0, 1.3, d / 2 - .05, w, .7, .08, 'paint', '#e3e5df'); return true
    case 'sink': {b.box(0,.42,0,w,.84,d,'wood');for(const x of [-w*.25,w*.25]){b.box(x,.45,-d/2-.016,w*.47,.7,.027,'paint','#c4c7b9');b.box(x,.7,-d/2-.035,.12,.022,.025,'metal')}b.box(0,.86,0,w-.1,.03,d-.1,'metal','#667b77');for(const x of [-w/2+.03,w/2-.03])b.box(x,.91,0,.06,.12,d,'metal','#b6bdb3');for(const z of [-d/2+.035,d/2-.035])b.box(0,.91,z,w,.12,.07,'metal','#b6bdb3');b.cylinder(0,.878,0,.025,.01,'metal','#485b58',false);b.bar([0,.97,d*.32],[0,1.22,d*.32],.018);b.bar([0,1.22,d*.32],[0,1.22,-.04],.018);return true }
    case 'refrigerator': b.box(0,H/2,0,w,H,d,'paint','#f0eee4'); b.box(0,H*.72,-d/2-.02,w-.06,H*.48,.03,'paint','#e5e3d9'); b.box(0,H*.28,-d/2-.02,w-.06,H*.42,.03,'paint','#e5e3d9'); for(const y of[H*.72,H*.28]) b.box(w/4,y,-d/2-.05,.04,.2,.04,'metal'); for(let i=0;i<4;i++) b.box(-w/3+i*w/5,.08,-d/2-.04,.025,.08,.03,'plastic','#424643'); return true
    case 'stove': b.box(0,.45,0,w,.9,d,'metal'); b.panel(0,.65,-d/2-.02,w-.1,.3,'sealedglass','#202526'); for(const x of[-w/4,w/4]) for(const z of[-d/4,d/4]) { const ring=b.ring(x,.92,z,.12,.025,'metal',undefined,false); ring.rx=Math.PI/2 } for(let i=0;i<4;i++){const knob=b.cylinder(-.18+i*.12,H-.08,-d/2-.04,.025,.04,'metal');knob.rx=Math.PI/2} b.bar([-.16,.78,-d/2-.06],[.16,.78,-d/2-.06],.018,'metal'); return true
    case 'dining_table': b.box(0, H - .08, 0, w, .16, d, 'wood'); legs(4, .07, H * .8, 'wood'); b.sphere(0, H + .04, 0, .22, .1, .22, 'metal'); return true
    case 'dining_chair': legs(4, .06, H * .44, 'wood'); b.box(0, H * .48, 0, w, .12, d, 'wood'); for (const x of [-w / 2 + .08, w / 2 - .08]) b.box(x, H * .75, d / 2 - .05, .06, H * .5, .06, 'wood'); for (let i = 0; i < 3; i++) b.box(0, H * (.62 + i * .15), d / 2 - .05, w - .12, .05, .05, 'wood'); return true
    case 'toilet': {
      b.cylinder(0,.18,.04,.14,.32,'porcelain','#ebe9df').taper=1.12
      b.sphere(0,.38,-.07,w*.95,.29,d*.72,'porcelain','#ebe9df',true)
      const seat=b.ring(0,.525,-.075,w*.49,.035,'porcelain','#f4f0df');seat.h=d*.69;seat.rx=Math.PI/2
      b.box(0,.60,d/2-.08,w*.86,.38,.16,'porcelain','#ebe9df');b.box(0,.805,d/2-.08,w*.88,.035,.18,'porcelain','#ebe9df')
      b.cylinder(w*.22,.83,d/2-.08,.025,.01,'metal',undefined,false)
      return true
    }
    case 'wash_basin': {
      b.cylinder(0,(H-.15)/2,.03,.09,H-.15,'porcelain','#ecebe2').taper=.75
      b.box(0,H-.1,0,w,.08,d,'porcelain','#e4e3db');b.box(0,H-.05,-.02,w-.13,.025,d-.12,'porcelain','#b8bbb3')
      for(const x of [-w/2+.03,w/2-.03])b.box(x,H-.015,0,.06,.06,d,'porcelain','#efede4')
      for(const z of [-d/2+.035,d/2-.035])b.box(0,H-.015,z,w-.08,.06,.07,'porcelain','#efede4')
      b.cylinder(0,H-.035,-.01,.024,.01,'metal',undefined,false)
      b.bar([0,H,d*.34],[0,H+.18,d*.34],.018,'metal');b.bar([0,H+.18,d*.34],[0,H+.18,-.01],.018,'metal')
      return true
    }
    case 'radiator': for (let i = 0; i < 10; i++) b.box(-w / 2 + .1 + i * (w - .2) / 9, H / 2, 0, .07, H, .14, 'metal'); b.cylinder(0, .18, 0, .04, w, 'metal').rz = Math.PI / 2; b.cylinder(0, H - .18, 0, .04, w, 'metal').rz = Math.PI / 2; return true
    case 'ceiling_light': {
      b.box(0,.065,0,w,.075,d,'paint','#aaa99d',false);b.box(0,.017,0,w-.1,.02,d-.07,'paint','#eeeada',false)
      for(const x of [-w*.35,w*.35])b.bar([x,.1,0],[x,.34,0],.008,'metal',undefined,false)
      return true
    }
    case 'floor_lamp': {b.cylinder(0,.04,0,.20,.08,'metal');b.cylinder(0,(H-.2)/2,0,.022,H-.2,'metal');const shade=b.cylinder(0,H-.16,0,.2,.32,'fabric','#d0c4aa',false);shade.taper=.62;b.cylinder(0,H-.31,0,.12,.02,'paint','#e8dfc5',false);return true }
    case 'classroom_desk': {
      b.box(0,H-.04,0,w,.08,d,'wood');legs(4,.05,H-.08,'metal');b.box(0,H-.2,0,w-.12,.025,d-.12,'metal')
      b.box(.04,H+.016,.015,.3,.025,.23,'paper','#e4dfcd');b.box(.04,H+.031,.015,.31,.007,.24,'paper','#718580',false)
      return true
    }
    case 'chalkboard': b.box(0, H / 2, 0, w, H, .08, 'wood'); b.box(0, H / 2, -.06, w - .16, H - .16, .025, 'paint', '#304b3d'); b.box(0, .08, -.1, w, .08, .12, 'wood'); return true
    case 'lab_bench': for (const x of [-w / 3, w / 3]) b.box(x, .45, 0, .55, .9, d, 'metal'); b.box(0, .93, 0, w, .14, d, 'concrete'); for (let i = 0; i < 3; i++) b.cylinder(-.35 + i * .35, 1.12, 0, .07, .3, 'glass', '#aab8ac', false); b.cylinder(0, 1.2, 0, .02, .25, 'metal'); return true
    case 'archive_shelf': for(const x of[-w/2+.1,w/2-.1]) for(const z of[-d/2+.1,d/2-.1]) b.box(x,H/2,z,.08,H,.08,'metal'); for(let i=0;i<5;i++){const y=.25+i*(H-.25)/5;b.box(0,y,0,w,.08,d,'metal');for(let j=0;j<3;j++){const x=-w/3+j*w/3;b.box(x,y+.15,-d/2+.2,.45,.25,.45,'paper','#b49f76');b.panel(x,y+.15,-d/2-.04,.16,.08,'paper','#e4e0c9');b.box(x,y+.3,-d/2+.2,.43,.02,.43,'paper','#9d875e')}} return true
    case 'microfilm_reader': b.box(0,.35,0,w,.7,d,'metal'); b.box(0,.9,.08,.55,.55,.12,'metal'); b.panel(0,.9,.008,.46,.39,'sealedglass','#25353d'); for(const x of[-.2,.2]){const ring=b.ring(x,.65,-.2,.11,.03,'metal',undefined,false);ring.rx=Math.PI/2} for(let i=0;i<3;i++){const knob=b.cylinder(-.15+i*.15,.65,-.3,.025,.04,'metal');knob.rx=Math.PI/2} return true
    case 'exhibit_case': {
      const base=.78,gh=H-base;
      b.box(0,base/2,0,w,base,d,'wood');b.box(0,base+.025,0,w,.05,d,'fabric','#b4b2a1')
      for(const x of [-w/2+.025,w/2-.025])for(const z of [-d/2+.025,d/2-.025])b.bar([x,base,z],[x,H,z],.012,'metal',undefined,false)
      for(const z of [-d/2+.015,d/2-.015])b.panel(0,base+gh/2,z,w-.05,gh,'glass','#d9e6e4')
      for(const x of [-w/2+.015,w/2-.015])b.panel(x,base+gh/2,0,d-.05,gh,'glass','#d9e6e4').ry=Math.PI/2
      b.panel(0,H,0,w-.05,d-.05,'glass','#d9e6e4').rx=Math.PI/2
      b.box(0,base+.12,0,.3,.2,.3,'concrete');b.sphere(0,base+.38,0,.22,.33,.22,'metal','#a19476')
      return true
    }
    case 'gym_bench': b.slats(w, d, H - .07, 5, 'wood'); for (const x of [-w / 3, 0, w / 3]) b.box(x, H / 2, 0, .08, H, d, 'metal'); return true
    case 'workbench': for (const x of [-w / 2 + .1, w / 2 - .1]) for (const z of [-d / 2 + .1, d / 2 - .1]) b.box(x, H / 2, z, .12, H, .12, 'wood'); b.box(0, H - .08, 0, w, .16, d, 'wood'); b.box(0, .35, d / 2 - .15, w - .2, .08, .3, 'metal'); b.box(w / 3, H + .1, 0, .3, .18, .3, 'metal'); b.box(w / 3, H + .23, 0, .08, .2, .08, 'metal'); b.box(w / 3, H + .35, 0, .3, .06, .08, 'metal'); b.box(0, H + .4, d / 2 - .05, w, .5, .05, 'wood'); for (let i = 0; i < 6; i++) b.cylinder(-w / 2 + .2 + i * .3, H + .5, d / 2 - .1, .025, .18, 'metal'); return true
    default: return false
  }
}
