import { L11PropBuilder } from './l11PropKit'

/** Retail fixtures have a customer face at -Z. Merchandise has real depth;
 * small labels intentionally contain no invented brand names or prices. */
export function l11RetailParts(key:string,b:L11PropBuilder):boolean {
  const {w,d,height:H}=b.def,ivory='#d8d5c6',dark='#38413e'
  const goods=(x:number,y:number,z:number,kind:number,front:number)=>{
    const colors=['#bfaa68','#678d73','#ab674a','#728c9c'],color=colors[kind%4]
    if(kind%3===0){
      b.cylinder(x,y+.105,z,.052,.21,'plastic',color,false)
      const shoulder=b.cylinder(x,y+.224,z,.052,.028,'plastic',color,false);shoulder.taper=.46
      b.cylinder(x,y+.251,z,.024,.028,'plastic',ivory,false)
      b.cylinder(x,y+.11,z,.0525,.075,'paper',ivory,false)
    }else if(kind%3===1){
      b.box(x,y+.125,z,.14,.25,.12,'paper',color,false)
      b.box(x,y+.126,z+front*.061,.116,.11,.003,'paper',ivory,false)
      b.box(x,y+.258,z,.14,.015,.12,'paper',color,false)
    }else{
      b.cylinder(x,y+.085,z,.056,.17,'metal',color,false)
      b.cylinder(x,y+.174,z,.055,.008,'metal',ivory,false)
      b.cylinder(x,y+.085,z,.057,.065,'paper',ivory,false)
    }
  }
  if(key==='retail_gondola'){
    b.box(0,.08,0,w,.16,d,'paint',ivory)
    b.box(0,H/2,0,w-.08,H,.045,'paint',ivory)
    for(const x of [-w/2+.025,w/2-.025])b.box(x,H/2,0,.05,H,.08,'metal',dark)
    for(let level=0;level<4;level++)for(const side of [-1,1]){
      const y=.18+level*.31,z=side*(d/4+.015)
      b.box(0,y,z,w-.04,.028,d/2-.035,'paint',ivory)
      b.box(0,y+.024,side*(d/2-.022),w-.045,.045,.018,'paint',ivory)
      for(let i=0;i<5;i++){
        const x=-w/2+.15+i*(w-.30)/4
        goods(x,y+.018,z+side*.09,level*5+i,side)
        b.box(x,y+.022,side*(d/2-.032),.09,.026,.004,'paper','#eae6d6',false)
      }
    }
    return true
  }
  if(key==='retail_checkout'){
    // Open cashier footwell and back access; the counter is not an office desk.
    b.box(0,.44,-d/2+.045,w,.88,.09,'wood','#a58c65')
    for(const x of [-w/2+.045,w/2-.045])b.box(x,.44,0,.09,.88,d,'wood','#a58c65')
    b.box(0,.905,0,w,.05,d,'paint',ivory)
    b.box(-w*.27,.943,0,w*.32,.026,d*.55,'rubber',dark)
    b.box(w*.22,.973,d*.12,.34,.086,.31,'plastic',dark)
    b.box(w*.22,1.08,d*.19,.045,.18,.045,'metal',dark)
    const monitor=b.box(w*.22,H-.10,d*.19,.33,.20,.038,'plastic',dark);monitor.rx=-.14
    const screen=b.panel(w*.22,H-.10,d*.214,.28,.155,'sealedglass','#718d85');screen.rx=-.14;screen.ry=Math.PI
    b.box(-w*.04,.95,-d*.23,.13,.04,.18,'plastic',dark).rx=.18
    for(const x of [-w/2+.16,-w/2+.37,-w/2+.58])goods(x,.932,d*.26,1,-1)
    return true
  }
  if(key==='retail_cooler'){
    b.box(0,.13,0,w,.26,d,'paint',ivory)
    b.box(0,H-.10,0,w,.2,d,'paint',ivory)
    b.box(0,H/2,d/2-.035,w,H,.07,'paint',ivory)
    for(const x of [-w/2+.03,w/2-.03])b.box(x,H/2,0,.06,H,d,'paint',ivory)
    for(let level=0;level<5;level++){
      const y=.30+level*.31
      b.box(0,y,0,w-.12,.025,d-.14,'metal',ivory)
      for(let i=0;i<6;i++)goods(-w/2+.16+i*(w-.32)/5,y+.018,-d*.20,level%2?0:2,-1)
    }
    for(const x of [-w/2+.06,0,w/2-.06])b.box(x,1.035,-d/2+.018,.032,1.53,.036,'metal',dark)
    for(const y of [.27,1.8])b.box(0,y,-d/2+.018,w-.08,.038,.036,'metal',dark)
    for(const side of [-1,1]){
      b.panel(side*w*.235,1.035,-d/2+.019,w*.44,1.49,'glass','#dbe4d9')
      b.bar([side*.075,.88,-d/2-.007],[side*.075,1.22,-d/2-.007],.012,'metal',dark)
    }
    for(let i=0;i<7;i++)b.box(0,.045+i*.023,-d/2-.002,w-.13,.008,.005,'rubber',dark,false)
    return true
  }
  return false
}
