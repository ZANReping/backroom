import { L11PropBuilder } from './l11PropKit'

export function l11WaterfrontParts(key: string, b: L11PropBuilder): boolean {
  const { w, d, height: h } = b.def
  switch (key) {
    case 'plane_tree': {
      // The reference avenue has pale, forked trunks and pruned broad crowns.
      // Connected tapered segments keep the same form from all sides; only
      // the fine twigs/foliage are non-solid. Dimensions are reconstruction.
      type P=[number,number,number]
      const limb=(a:P,c:P,r:number,tip:number,solid=true)=>{const p=b.bar(a,c,r,'bark','#e1dfd0',solid);p.taper=tip/r;return p}
      const base:P=[0,0,0],root:P=[.025,.4,-.015],middle:P=[-.045,1.35,.04],fork:P=[.035,2.32,.07]
      limb(base,root,.25,.185);limb(root,middle,.19,.163);limb(middle,fork,.168,.14)
      for(const [p,r]of [[root,.193],[middle,.173],[fork,.145]] as [P,number][])b.sphere(...p,r*2,r*2,r*2,'bark','#e1dfd0',true)
      const forks:P[]=[[-.63,3.22,-.38],[.74,3.38,.26],[-.22,3.43,.72],[.24,3.7,-.73]]
      const tips:P[]=[[-1.62,4.62,-.89],[1.76,4.83,.55],[-.8,4.7,1.65],[.9,4.9,-1.63]]
      for(let i=0;i<forks.length;i++){
        limb(i===3?middle:fork,forks[i],i===3?.095:.115,.074)
        limb(forks[i],tips[i],.078,.035)
        for(let k=0;k<3;k++){
          const a=i*1.9+k*1.7,end:P=[tips[i][0]+Math.cos(a)*.65,5.35+(k%2)*.38,tips[i][2]+Math.sin(a)*.68]
          limb(tips[i],end,.031,.012,false)
        }
      }
      // Overlapping rounded rectangular crowns form one continuous canopy,
      // with a level pruning envelope and small unequal lobes at the edges.
      for(const [x,y,z,cw,ch,cd]of [[-1.04,5.15,-.75,3.65,2.65,3.15],[1.03,5.25,-.67,3.7,2.8,3.2],[-.92,5.12,.84,3.7,2.6,3.1],[1.08,5.14,.87,3.5,2.67,3.08]]){
        b.sphere(x,y,z,cw,ch,cd,'grass','#687e50',false).foliage='trimmed'
      }
      return true
    }
    case 'cypress':
      b.cylinder(0, h * .25, 0, .12, h * .5, 'bark', '#b8b7a7')
      for (let i = 0; i < 3; i++) b.sphere(0, h * (.43 + i * .18), 0, w * (.72 - i * .16), h * (.4 - i * .04), d * (.72 - i * .16), 'grass', '#3f6244', false)
      return true
    case 'shrub_planter':
      b.box(0, .08, -d / 2, w, .16, .08, 'concrete', '#878681'); b.box(0, .08, d / 2, w, .16, .08, 'concrete', '#878681'); b.box(-w / 2, .08, 0, .08, .16, d, 'concrete', '#878681'); b.box(w / 2, .08, 0, .08, .16, d, 'concrete', '#878681')
      b.box(0,.12,0,w-.1,.08,d-.1,'concrete','#48483b',false)
      for (const x of [-w * .23, w * .23]) b.sphere(x,h*.58,0,w*.52,h*.76,d*.85,'grass','#617746',false).foliage='trimmed'
      return true
    case 'flower_planter':
      b.cylinder(0, h * .32, 0, w * .36, h * .62, 'concrete', '#ad775d'); const rim=b.ring(0,h*.65,0,w*.4,.06,'concrete','#d18b6d'); rim.rx=Math.PI/2; b.cylinder(0,h*.67,0,w*.32,.025,'concrete','#40352b',false)
      for (let i = 0; i < 5; i++) { const x = (i - 2) * w * .15; b.cylinder(x, h * .78, 0, .018, h * .3, 'grass', '#55774d', false); b.sphere(x, h * .92, 0, .1, .1, .1, 'paint', i % 2 ? '#f4e4bd' : '#b7463d', false) }
      return true
    case 'park_bench':
      for (const x of [-w * .32, w * .32]) b.box(x, h * .3, 0, .1, h * .6, d * .7, 'metal', '#3f4847')
      b.slats(w*.86,d*.7,h*.58,6,'wood'); for(let i=0;i<3;i++){const p=b.box(0,h*(.72+i*.11),d*.28,w*.86,.07,.07,'wood','#8c6a48');p.grain='x'}
      for(const x of [-w*.32,w*.32]) b.bar([x,h*.62,d*.24],[x,h*.9,d*.34],.025,'metal','#3f4847',false)
      for (const x of [-w * .48, w * .48]) b.box(x, h * .74, 0, .06, .06, d * .8, 'metal', '#3f4847')
      return true
    case 'picnic_table':
      b.slats(w * .8, d * .35, h * .62, 5, 'wood'); for (const x of [-w * .35, w * .35]) for (const z of [-d * .3, d * .3]) b.box(x, h * .3, z, .08, h * .6, .08, 'wood', '#715438')
      for (const z of [-d * .46, d * .46]) for(let k=0;k<2;k++) b.box(0,h*.35,z+(k-.5)*d*.1,w*.8,.055,d*.09,'wood')
      return true
    case 'canal_railing':
      for (const x of [-w / 2, 0, w / 2]) b.cylinder(x, h / 2, 0, .025, h, 'metal', '#586365')
      for (const y of [h * .35, h * .68, h * .94]) b.box(0, y, 0, w, .035, .035, 'metal', '#586365')
      return true
    case 'quay_balustrade':
      // Stone piers interrupt fine black railing panels. A module is centred
      // on its pier so neither chunk ownership nor a bend duplicates it.
      b.box(0,.065,0,.44,.13,.46,'concrete','#9c9b87')
      b.box(0,.57,0,.36,.88,.38,'concrete','#aaa68f')
      b.box(0,1.055,0,.46,.09,.5,'concrete','#b9b49f')
      for(const side of [-1,1]){
        const start=.23,end=w/2-.02,length=end-start,cx=side*(start+end)/2
        b.box(side*end,.52,0,.035,1.04,.045,'metal','#373c37')
        for(const y of [.16,.97])b.box(cx,y,0,length,.042,.05,'metal','#373c37')
        const count=Math.ceil(length/.14)
        for(let i=1;i<count;i++)b.box(side*(start+length*i/count),.565,0,.014,.77,.018,'metal','#41433b')
        b.box(side*(start+.035),.57,0,.035,.84,.045,'metal','#373c37')
      }
      return true
    case 'canal_ladder': {
      const rail='#4f5958', rung='#69716d'
      for(const x of [-.28,.28]){
        b.bar([x,.08,0],[x,3.18,0],.045,'metal',rail)
        b.bar([x,3.12,0],[x,3.5,.22],.04,'metal',rail)
        for(const y of [.35,1.7,3.12])b.bar([x,y,0],[x,y,.48],.035,'metal',rail)
      }
      for(let y=.42;y<3.05;y+=.28)b.box(0,y,0,.56,.045,.045,'metal',rung)
      return true
    }
    case 'sewer_outlet': {
      const frame='#96948a'
      b.box(0,.14,-.01,1.4,.2,.28,'concrete',frame)
      b.box(0,1.16,-.01,1.4,.2,.28,'concrete',frame)
      b.box(-.6,.65,-.01,.2,.82,.28,'concrete',frame)
      b.box(.6,.65,-.01,.2,.82,.28,'concrete',frame)
      const opening=b.cylinder(0,.65,-.115,.46,.018,'paint','#171e1c',false);opening.rx=Math.PI/2
      b.ring(0,.65,-.17,.5,.055,'metal','#505958',true)
      for(let x=-.3;x<=.3;x+=.2)b.box(x,.65,-.24,.035,.78,.035,'metal','#424b49',true)
      return true
    }
    case 'mooring_bollard':
      b.cylinder(0, h * .4, 0, .12, h * .8, 'metal', '#555e5d'); b.box(0, h * .8, 0, .5, .08, .12, 'metal', '#555e5d'); b.box(0, .04, 0, .38, .08, .38, 'metal', '#454c4c')
      return true
    case 'life_ring':
      b.ring(0,h*.72,0,.31,.055,'paint','#d6543d',false)
      for(let i=0;i<4;i++){const p=b.ring(0,h*.72,0,.316,.061,'fabric','#f4f1dc',false);p.arc=.32;p.rz=i*Math.PI/2-.16}b.ring(0,h*.72,.018,.337,.009,'fabric','#eee7d0',false)
      b.box(0,h*.4,.08,.04,h*.8,.04,'metal','#555b58')
      return true
    case 'lock_winch':
      b.box(0,h*.3,.10,w*.5,h*.6,d*.5,'metal','#555e5f'); b.ring(0,h*.65,-.21,.3,.03,'metal','#444b4b'); b.cylinder(0,h*.65,-.07,.045,.28,'metal','#444b4b').rx=Math.PI/2; for(const a of [0,Math.PI*2/3,Math.PI*4/3])b.bar([0,h*.65,-.21],[Math.cos(a)*.27,h*.65+Math.sin(a)*.27,-.21],.015,'metal','#444b4b',false)
      return true
    case 'lock_gate':
      for (const x of [-w * .4, w * .4]) b.box(x, h / 2, 0, .16, h, .2, 'metal', '#495457')
      b.box(0, h * .45, 0, w * .7, h * .7, .12, 'wood', '#745a42'); for (let i = 0; i < 3; i++) b.box(0, h * (.25 + i * .22), -.08, w * .75, .05, .1, 'metal', '#4c5657'); const brace = b.box(0, h * .45, -.1, .06, h * .65, .08, 'metal', '#4c5657'); brace.rz = .65
      return true
    case 'drinking_fountain':
      b.box(0,h*.43,0,.18,h*.86,.18,'concrete','#a3a09a'); b.cylinder(0,h*.89,0,.19,.06,'porcelain','#deddd0'); b.ring(0,h*.94,0,.19,.015,'porcelain','#e6e3d5').rx=Math.PI/2; b.bar([.1,h*.9,.1],[.1,h*1.06,.1],.018);b.bar([.1,h*1.06,.1],[.1,h*1.06,-.015],.018)
      return true
    case 'park_lamp':
      b.cylinder(0,(h-.45)/2,0,.045,h-.45,'metal','#303739'); b.cylinder(0,.05,0,.12,.1,'metal','#303739')
      for(const y of [h-.44,h-.04])b.box(0,y,0,.35,.045,.35,'metal','#303739')
      for(const x of [-.15,.15])for(const z of [-.15,.15])b.box(x,h-.24,z,.018,.4,.018,'metal','#303739')
      for(const z of [-.15,.15])b.panel(0,h-.24,z,.28,.36,'glass','#dce0c6')
      for(const x of [-.15,.15])b.panel(x,h-.24,0,.28,.36,'glass','#dce0c6').ry=Math.PI/2
      b.sphere(0,h-.24,0,.10,.18,.10,'paint','#e3ddbd')
      return true
    case 'fountain':
      b.cylinder(0,.055,0,w*.45,.11,'concrete','#8d918b');b.ring(0,.20,0,w*.45,.10,'concrete','#8d918b').rx=Math.PI/2
      b.cylinder(0,.15,0,w*.38,.02,'glass','#78a7a7',false);b.cylinder(0,.38,0,.16,.55,'concrete','#8d918b')
      b.cylinder(0,.61,0,w*.21,.09,'concrete','#8d918b');b.ring(0,.67,0,w*.22,.04,'concrete','#8d918b').rx=Math.PI/2;b.cylinder(0,.65,0,w*.19,.02,'glass','#78a7a7',false)
      b.cylinder(0,.88,0,.07,.52,'concrete','#8d918b');b.sphere(0,1.19,0,.19,.2,.19,'concrete','#8d918b')
      return true
    case 'pergola':
      for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {const p=b.box(x,h*.5,z,.12,h,.12,'wood','#76553d');p.grain='y'}
      for(const z of [-d/2,d/2]) {const p=b.box(0,h,z,w,.12,.12,'wood','#76553d');p.grain='x'} for(let i=0;i<7;i++){const p=b.box(-w/2+(i+.5)*w/7,h,0,.1,.1,d,'wood','#76553d');p.grain='z'}
      return true
    default: return false
  }
}
