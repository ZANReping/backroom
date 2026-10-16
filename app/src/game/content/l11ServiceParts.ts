import { L11PropBuilder } from './l11PropKit'

/** Geometry recipes for Level 11 service and construction props. The key omits `l11_`. */
export function l11ServiceParts(key: string, b: L11PropBuilder): boolean {
  const { w, d, height: h } = b.def
  const metal = '#687078', dark = '#25282a', white = '#d7d9d5', wood = '#efeddf'
  switch (key) {
    case 'hvac':
      b.box(0, Math.min(.15, h * .12), 0, w, Math.min(.3, h * .25), d, 'paint', white)
      b.box(0, h * .45, 0, w * .88, h * .65, d * .78, 'paint', white)
      for (let i = -3; i <= 4; i++) b.box(i * w / 8, h * .48, -d * .405, w * .055, h * .34, .025, 'metal', dark)
      for(const x of [-w*.25,w*.25]){
        const r=Math.min(w,d)*.18,y=h*.79
        b.cylinder(x,y-.006,0,r,.015,'rubber',dark,false)
        b.ring(x,y+.012,0,r,.016,'metal',metal,false).rx=Math.PI/2
        for(let i=0;i<3;i++){const a=i*Math.PI*2/3;b.bar([x,y+.015,0],[x+Math.cos(a)*r*.82,y+.015,Math.sin(a)*r*.82],.025,'metal',metal,false)}
        for(const offset of [-.09,0,.09])b.bar([x-r*.8,y+.04,offset],[x+r*.8,y+.04,offset],.006,'metal',dark,false)
      }
      return true
    case 'duct':
      b.box(0, h * .5, 0, w * .8, h * .65, d * .8, 'metal', metal)
      for (const z of [-d * .36, d * .36]) b.box(0, h * .5, z, w * .88, h * .72, .06, 'metal', dark)
      b.box(0, h * .5, 0, .035, h * .7, d * .84, 'metal', dark)
      return true
    case 'downpipe':
      b.cylinder(0, h / 2, d*.28, .05, h, 'metal', metal)
      for (const y of [h * .2, h * .52, h * .84]) { b.box(0, y, d*.24, .18, .06, .08, 'metal', dark); b.bar([0,y,d*.24],[0,y,d*.32],.025,'metal',dark) }
      b.bar([0,.04,d*.28],[0,.04,d*.12],.05,'metal',metal); b.bar([0,.04,d*.12],[0,.04,-d*.02],.05,'metal',metal)
      return true
    case 'fire_escape':
      // Twelve level treads run from the front (-z) to the three metre landing.
      const landingY=h-.9, landingStart=d/2-.55, runStart=-d/2, runLength=landingStart-runStart
      for(let i=0;i<12;i++){const t=(i+.5)/12; b.box(0,.1+t*(landingY-.1),runStart+t*runLength,w*.72,.07,runLength/12*.9,'metal',metal)}
      b.box(0,landingY,landingStart+.275,w,.08,.55,'metal',metal)
      // Sloped handrails, then the higher landing-side guard rails.
      for(const x of [-w*.45,w*.45]){
        b.bar([x,.06,runStart],[x,landingY-.04,landingStart],.045,'metal',dark)
        b.bar([x,.85,runStart],[x,landingY+.85,landingStart],.035,'metal',dark)
        b.bar([x,landingY+.85,landingStart],[x,h-.05,d/2],.027,'metal',dark)
        b.bar([x,landingY,landingStart],[x,landingY,d/2],.03,'metal',metal)
        for(let i=0;i<=4;i++){const t=i/4,z=runStart+t*runLength;b.bar([x,.06+t*(landingY-.1),z],[x,.85+t*landingY,z],.022,'metal',metal)}
        b.bar([x,landingY,d/2-.02],[x,landingY+.85,d/2-.02],.025,'metal',metal)
      }
      // Rear load posts, front foot plates, and brackets tying the landing toward +z.
      for(const x of [-w*.42,w*.42]){b.bar([x,0,landingStart],[x,landingY,landingStart],.045,'metal',dark);b.box(x,.035,runStart,.16,.07,.18,'metal',dark)}
      for(const x of [-w*.35,w*.35]) b.bar([x,landingY-.08,landingStart+.18],[x,landingY-.08,d/2],.035,'metal',dark)
      return true
    case 'loading_dock':
      b.box(0,h*.5,d*.15,w,h,d*.7,'concrete','#858786')
      for(const x of [-w*.1,w*.35])b.box(x,h*.62,-d*.21,.15,.35,.08,'rubber',dark)
      for(let i=0;i<5;i++)b.box(-w*.35,(i+1)*h/10,-d/2+(i+.5)*d*.06,w*.26,(i+1)*h/5,d*.061,'concrete','#858786')
      return true
    case 'pallet':
      for(const x of [-w*.35,0,w*.35]){b.box(x,.07,0,.11,.085,d,'rawwood',wood).grain='z';b.box(x,.015,0,.13,.03,d,'rawwood',wood).grain='z'}
      for(let i=0;i<5;i++)b.box(0,.125,-d/2+(i+.5)*d/5,w,.025,d/5*.85,'rawwood',wood).grain='x'
      return true
    case 'pallet_stack':
      for(let i=0;i<5;i++){const y=i*.15;for(const x of [-w*.35,0,w*.35]){b.box(x,y+.07,0,.11,.085,d,'rawwood',wood).grain='z';b.box(x,y+.015,0,.13,.03,d,'rawwood',wood).grain='z'}for(let j=0;j<5;j++)b.box(0,y+.125,-d/2+(j+.5)*d/5,w,.025,d/5*.85,'rawwood',wood).grain='x'}
      return true
    case 'dumpster':
      b.box(0, h * .48, 0, w, h * .8, d, 'metal', '#4f5b5b')
      for(const x of [-w*.25,w*.25]){b.box(x,h*.91,0,w*.48,.06,d*.98,'plastic',dark);b.box(x,h*.9,d*.49,.12,.09,.08,'metal',dark)}
      b.box(0,h*.63,-d*.52,w*.25,.07,.06,'metal',dark)
      for (const x of [-w*.35,w*.35]) for (const z of [-d*.35,d*.35]) { const p=b.cylinder(x,.09,z,.09,.12,'rubber',dark); p.rz=Math.PI/2 }
      return true
    case 'scaffold':
      for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.cylinder(x, h / 2, z, .035, h, 'metal', metal)
      for (const y of [h * .45, h * .86]) { b.box(0, y, 0, w, .07, .07, 'metal', dark); b.box(0, y, 0, .07, .07, d, 'metal', dark); }
      b.box(0, h * .4, 0, w * .9, .08, d * .9, 'rawwood', wood); b.box(0, h * .8, 0, w * .9, .08, d * .9, 'rawwood')
      for(const x of [-w/2,w/2]){b.bar([x,.03,-d/2],[x,h,d/2],.025,'metal',dark);for(const z of [-d/2,d/2])b.box(x,.025,z,.18,.05,.18,'metal',dark)}
      return true
    case 'safety_fence':
      for (const x of [-w / 2, w / 2]) { b.cylinder(x, h / 2, 0, .025, h, 'metal', dark); b.box(x, .03, 0, .2, .06, .2, 'concrete', '#666') }
      for (let i = 0; i < 10; i++) b.box(-w / 2 + (i + .5) * w / 10, h / 2, 0, .012, h, .012, 'metal', '#b5b9b0')
      for (let i = 1; i <= 5; i++) b.box(0, h * i / 6, 0, w, .012, .012, 'metal', '#b5b9b0')
      return true
    case 'cone':
      b.box(0,.025,0,w,.05,d,'rubber',dark)
      {const height=h-.05,base=w*.42,radius=(t:number)=>base*(1-.88*t);for(const [lo,hi,c]of [[0,.42,'#dc692f'],[.42,.65,'#f3f1d7'],[.65,1,'#dc692f']] as const){const p=b.cylinder(0,.05+(lo+hi)*height/2,0,radius(lo),(hi-lo)*height,'paint',c);p.taper=radius(hi)/radius(lo)}}
      return true
    case 'road_barrier':
      for (const x of [-w * .4, w * .4]) { b.box(x, .12, 0, .24, .24, d, 'metal', dark); b.box(x, h / 2, 0, .1, h, .1, 'metal', dark) }
      for (let i = 0; i < 6; i++) b.box(-w * .35 + i * w * .14, h * .52, 0, w * .15, h * .5, .08, 'paint', i % 2 ? '#f1eee0' : '#b83232')
      return true
    case 'cable_reel':
      for(const x of [-w*.36,w*.36]){const disk=b.cylinder(x,h*.43,0,h*.42,.07,'rawwood','#ecebdc');disk.rz=Math.PI/2;disk.grain='y'}
      b.cylinder(0,h*.43,0,h*.25,w*.7,'rubber',dark).rz=Math.PI/2
      for(let i=0;i<10;i++)b.ring(-w*.3+i*w*.6/9,h*.43,0,h*.29,.028,'rubber','#363735').ry=Math.PI/2
      return true
    case 'cement_mixer':
      for (const x of [-w*.3,w*.3]) { const p=b.cylinder(x,.16,d*.25,.16,.14,'rubber',dark); p.rz=Math.PI/2 }
      b.box(0,h*.25,0,w*.6,.08,d*.5,'metal',dark); b.bar([-w*.3,.16,0],[w*.3,.16,0],.035,'metal',dark)
      const drum=b.sphere(0,h*.58,0,w*.65,h*.55,d*.65,'paint','#758087',true); drum.rz=-.25
      const rim=b.ring(0,h*.65,-d*.32,w*.27,.05,'metal',dark); rim.rx=0
      const opening=b.cylinder(0,h*.65,-d*.34,w*.23,.035,'metal',dark); opening.rx=Math.PI/2
      b.bar([w*.38,.035,-d*.3],[w*.38,h*.8,.04],.03,'metal',dark); b.bar([-w*.3,.16,d*.25],[0,h*.5,0],.025,'metal',dark);b.bar([w*.3,.16,d*.25],[0,h*.5,0],.025,'metal',dark)
      return true
    case 'ladder':
      for (const x of [-w*.35,w*.35]) b.bar([x,.035,0],[x,h-.035,.18],.035,'metal',metal)
      for (let i=1;i<=8;i++) { const t=i/9; b.bar([-w*.35,h*t,.18*t],[w*.35,h*t,.18*t],.03,'metal',dark) }
      return true
    default: return false
  }
}
