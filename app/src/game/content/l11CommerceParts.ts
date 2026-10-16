import { L11PropBuilder } from './l11PropKit'

/** Fronts face -Z; dimensions and surface UVs are in metres. */
export function l11CommerceParts(key:string,b:L11PropBuilder):boolean {
  const {w,d,height:H}=b.def
  const wheel=(x:number,z:number,r=.29)=>{
    b.cylinder(x,r,z,r,.14,'rubber','#424644').rz=Math.PI/2
    b.cylinder(x,r,z,r*.55,.152,'metal','#aab1b0').rz=Math.PI/2
    for(const side of [-1,1]){
      b.ring(x+side*.074,r,z,r*.83,.016,'rubber','#343936').ry=Math.PI/2
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b.cylinder(x+side*.082,r+Math.cos(a)*r*.3,z+Math.sin(a)*r*.3,.012,.009,'metal','#505958',false).rz=Math.PI/2}
    }
  }
  const table=(height=.72)=>{b.legs(w*.85,d*.85,height);b.box(0,height,0,w,.055,d,'wood')}
  const crate=(x:number,z:number,cw:number,cd:number,y=.02)=>{
    b.box(x,y+.025,z,cw,.05,cd,'rawwood','#eeebdd')
    for(const xx of [-cw/2+.025,cw/2-.025])for(const zz of [-cd/2+.025,cd/2-.025])b.box(x+xx,y+.17,z+zz,.05,.34,.05,'rawwood','#eeebdd')
    for(const yy of [.12,.26]){
      for(const zz of [-cd/2,cd/2])b.box(x,y+yy,z+zz,cw,.085,.035,'rawwood','#eeebdd').grain='x'
      for(const xx of [-cw/2,cw/2])b.box(x+xx,y+yy,z,.035,.085,cd,'rawwood','#eeebdd').grain='z'
    }
  }
  switch(key){
    case 'shop_awning':{
      const p=b.box(0,2.8,0,w,.045,d,'fabric','#8a9b99',false);p.rx=-.12
      for(let i=0;i<10;i++)b.box(-w/2+(i+.5)*w/10,2.64,-d/2,w/10*.95,.17,.025,'fabric',i%2?'#d4d0b6':'#8a9b99',false)
      for(const x of [-w/2+.1,w/2-.1]){b.bar([x,2.25,d/2],[x,2.71,-d/2+.06],.023,'metal',undefined,false);b.bar([x,2.25,d/2],[x,2.89,d/2],.025,'metal',undefined,false)}
      break
    }
    case 'cafe_table':b.cylinder(0,.035,0,.28,.07);b.cylinder(0,.39,0,.042,.68);b.cylinder(0,.727,0,w/2,.045,'wood');b.ring(0,.72,0,w/2,.012,'metal').rx=Math.PI/2;break
    case 'cafe_chair':b.legs(.42,.45,.44);b.slats(.48,.46,.45,4,'wood');for(const x of [-.22,.22])b.bar([x,.42,.19],[x,.84,.23],.018);for(let i=0;i<3;i++)b.box(0,.61+i*.09,.21+i*.008,.48,.065,.025,'wood');break
    case 'menu_board':{
      for(const z of [-.22,.22]){const p=b.box(0,.56,z,w,.9,.045,'wood');p.rx=z>0?.15:-.15}
      b.box(0,.63,-.3,w-.08,.68,.025,'paint','#293b36',false)
      b.bar([-w*.45,.98,0],[w*.45,.98,0],.012,'metal',undefined,false)
      for(const x of [-w*.45,w*.45])b.bar([x,.36,-.25],[x,.36,.25],.012,'metal',undefined,false)
      break
    }
    case 'display_rack':{
      b.legs(w,d,H);for(let i=0;i<4;i++){const y=.16+i*.35;b.box(0,y,0,w,.03,d);b.box(0,y+.06,d/2-.02,w,.09,.025,'metal');for(let k=0;k<4;k++){const x=-w*.35+k*w*.23;b.box(x,y+.13,0,.18,.22,.25,'paper',k%2?'#b8a484':'#8caba6');b.panel(x,y+.15,-.129,.12,.07,'paper','#ddd8bf')}}break
    }
    case 'newspaper_box':{
      const c='#718284';b.box(0,.31,0,w,.62,d,'paint',c)
      for(const x of [-w/2+.025,w/2-.025])b.box(x,.8,0,.05,.4,d,'paint',c)
      b.box(0,.8,d/2-.025,w,.4,.05,'paint',c);b.box(0,1.04,0,w,.08,d,'paint',c)
      b.panel(0,.81,-d/2-.004,w-.11,.36,'glass','#c7d6ce');b.bar([w*.3,.68,-d/2-.025],[w*.3,.91,-d/2-.025],.013,'metal')
      for(let i=0;i<6;i++)b.box(0,.645+i*.017,.02,w-.14,.014,d-.12,'paper',i%2?'#d5cfbb':'#bab5a3')
      b.box(0,.41,-d/2-.008,w*.6,.05,.022,'rubber','#222927',false);break
    }
    case 'vending_machine':{
      const c='#985e4e';b.box(0,.25,0,w,.5,d,'paint',c);b.box(0,H-.09,0,w,.18,d,'paint',c);b.box(0,H/2,d/2-.025,w,H,.05,'paint',c)
      for(const x of [-w/2+.025,w/2-.025])b.box(x,H/2,0,.05,H,d,'paint',c)
      b.box(w*.35,H*.59,0,w*.28,H*.67,d,'paint',c)
      for(let j=0;j<4;j++){const y=.53+j*.28;b.box(-w*.12,y,0,w*.64,.025,d*.83,'metal');for(let i=0;i<3;i++){const x=-w*.32+i*w*.2;b.cylinder(x,y+.10,-d*.26,.052,.18,'plastic',['#b7aa70','#8db2a5','#b47f65'][i],false);b.cylinder(x,y+.198,-d*.26,.03,.018,'metal',undefined,false);b.panel(x,y+.022,-d*.425,.09,.025,'paper','#dedcc5')}}
      b.panel(-w*.12,H*.58,-d/2-.008,w*.65,H*.63,'glass','#b8d2cb')
      for(let j=0;j<3;j++)for(let i=0;i<2;i++)b.box(w*.3+i*.085,H*.65-j*.065,-d/2-.02,.047,.037,.02,'plastic','#ddd8bd',false)
      b.panel(w*.34,H*.78,-d/2-.017,.17,.1,'sealedglass','#819a81');b.box(w*.34,H*.4,-d/2-.02,.11,.025,.02,'rubber','#343936',false)
      b.box(0,.23,-d/2-.014,w*.67,.19,.025,'rubber','#28312f',false);b.box(0,.12,-d/2-.035,w*.7,.035,.07,'metal');break
    }
    case 'phone_booth':{
      const c='#824e43';for(const x of [-.47,.47])for(const z of [-.47,.47])b.box(x,H/2,z,.06,H,.06,'paint',c)
      b.box(0,H-.05,0,w,.1,d,'paint',c)
      for(const x of [-.47,.47]){b.panel(x,1.23,0,d-.1,1.7,'glass','#c4d5ca').ry=Math.PI/2;b.box(x,.65,0,.035,.035,d,'metal')}
      b.panel(0,1.23,.47,w-.1,1.7,'glass','#c4d5ca');b.box(0,1.25,.34,.34,.54,.18,'metal')
      b.box(-.17,1.33,.18,.045,.25,.045,'rubber','#252b29');for(const y of [1.20,1.46])b.box(-.145,y,.17,.095,.05,.065,'rubber','#252b29')
      for(let j=0;j<3;j++)for(let i=0;i<3;i++)b.box(-.05+i*.05,1.3-j*.045,.237,.025,.025,.012,'plastic','#bbbcab',false)
      b.bar([-.17,1.2,.18],[-.17,.94,.2],.007,'rubber','#252b29',false);b.bar([-.17,.94,.2],[0,1.02,.23],.007,'rubber','#252b29',false)
      b.box(.04,1.48,.238,.11,.025,.015,'rubber','#252b29',false);break
    }
    case 'parcel_locker':b.box(0,H/2,0,w,H,d,'paint','#8a937f');b.panelGrid(w-.06,H-.1,-d/2-.02,5,4,.05);break
    case 'market_stall':{
      table(.8);for(const x of [-w/2+.12,w/2-.12])for(const z of [-d/2+.12,d/2-.12])b.box(x,H/2,z,.05,H,.05)
      for(const side of [-1,1]){const p=b.box(0,H-.13,side*d*.23,w,.035,d*.52,'fabric','#9fae99',false);p.rx=side*.23}
      for(let k=0;k<5;k++){const x=-w*.36+k*w*.18;crate(x,0,w*.16,d*.46,.84);for(let j=0;j<3;j++)b.sphere(x+(j-1)*.1,1.15,(j%2-.5)*.2,.15,.14,.15,'plastic',k%2?'#b69d65':'#8d9d69');for(let j=0;j<4;j++)b.sphere(x+(j%2-.5)*.19,1.0,(j<2?-.16:.16),.18,.18,.18,'plastic',k%2?'#b69d65':'#8d9d69')}
      break
    }
    case 'umbrella':{
      b.cylinder(0,.04,0,.3,.08,'concrete');b.cylinder(0,(H-.03)/2,0,.03,H-.03)
      const canopy=b.cylinder(0,H-.25,0,w/2,.5,'fabric','#c5c0a7',false);canopy.taper=0;canopy.d=d
      for(let i=0;i<8;i++){const a=i*Math.PI/4;b.bar([0,H-.02,0],[Math.cos(a)*w*.49,H-.51,Math.sin(a)*d*.49],.009,'metal',undefined,false)}
      break
    }
    case 'produce_crates':for(let i=0;i<3;i++){const x=(i-1)*w/3;crate(x,0,w/3-.045,d-.06);for(let k=0;k<7;k++)b.sphere(x+(k%3-1)*.115,.35+(k>4?.07:0),(Math.floor(k/3)-1)*.19,.15,.16,.15,'plastic',i%2?'#c1a464':'#879b64')}break
    case 'shopping_cart':{
      for(const x of [-w*.38,w*.38])for(const z of [-d*.33,d*.33])wheel(x,z,.07)
      for(const x of [-w*.42,w*.42]){b.bar([x,.14,d*.34],[x,.85,d*.35],.018);b.bar([x,.14,-d*.33],[x,.43,-d*.35],.018);b.bar([x,.16,-d*.33],[x,.16,d*.33],.016);b.bar([x,.45,-d*.42],[x,.85,d*.35],.008);b.bar([x,.84,-d*.42],[x,.84,d*.35],.015)}
      for(let i=0;i<8;i++){const z=-d*.42+i*d*.77/7;b.bar([-w*.42,.46,z],[w*.42,.46,z],.007,'metal',undefined,false);for(const x of [-w*.42,w*.42])b.bar([x,.46,z],[x,.84,z],.007,'metal',undefined,false)}
      for(const z of [-d*.42,d*.35]){b.bar([-w*.42,.84,z],[w*.42,.84,z],.013);for(let i=0;i<6;i++){const x=-w*.42+i*w*.84/5;b.bar([x,.46,z],[x,.84,z],.007,'metal',undefined,false)}}
      b.bar([-w*.42,.84,d*.35],[-w*.42,.94,d*.45],.018);b.bar([w*.42,.84,d*.35],[w*.42,.94,d*.45],.018);b.box(0,.94,d*.45,w*.9,.035,.04,'plastic','#536e6b');break
    }
    case 'delivery_bike':case 'motor_scooter':{
      const scooter=key==='motor_scooter',r=scooter?.245:.285,front=-d*.34,rear=d*.34
      for(const z of [front,rear]){b.ring(0,r,z,r,scooter?.052:.032,'rubber','#343936',true).ry=Math.PI/2;b.cylinder(0,r,z,.055,.1,'metal').rz=Math.PI/2;for(let i=0;i<8;i++){const a=i*Math.PI/4;b.bar([0,r,z],[0,r+Math.cos(a)*(r-.04),z+Math.sin(a)*(r-.04)],.006,'metal',undefined,false)}}
      b.bar([0,r,rear],[0,.68,d*.09],.024);b.bar([0,.68,d*.09],[0,.38,-d*.04],.024);b.bar([0,.38,-d*.04],[0,r,rear],.024)
      b.bar([0,.38,-d*.04],[0,.77,front+.09],.022);b.bar([0,.68,d*.09],[0,.77,front+.09],.022);b.bar([0,r,front],[0,.98,front+.14],.025)
      b.bar([-w/2,.99,front+.1],[w/2,.99,front+.1],.018);for(const x of [-w*.43,w*.43])b.box(x,.99,front+.08,w*.16,.045,.055,'rubber','#343936')
      b.box(0,.745,d*.09,.28,.065,.32,'fabric','#686a5c');b.bar([0,.38,-d*.04],[w*.35,.025,.1],.016,'metal',undefined,false)
      if(scooter){b.box(0,.43,0,w*.68,.25,d*.5,'paint','#8caaa5');b.box(0,.7,front+.17,w*.53,.4,.15,'paint','#8caaa5');b.panel(0,.81,front+.08,.21,.13,'paint','#ded9bf')}
      else {crate(0,rear,w-.04,.45,.81);b.box(0,.79,rear,w,.035,.5,'metal');for(const x of [-.11,.11]){b.bar([x,r,rear],[x,.78,rear+.15],.016);b.bar([x,.67,d*.09],[x,.78,rear-.12],.016)}b.ring(.03,.38,-d*.04,.12,.015,'metal').ry=Math.PI/2;for(const side of [-1,1]){b.bar([side*.04,.38,-d*.04],[side*.13,.38+side*.1,-d*.04],.012);b.box(side*.17,.38+side*.1,-d*.04,.10,.025,.07,'rubber')}}
      break
    }
    case 'sedan':case 'taxi':{
      const body=key==='taxi'?'#bba15e':'#576c73'
      b.box(0,.35,0,w*.88,.18,d*.9,'rubber','#333e3f')
      const lower=b.box(0,.68,0,w*.98,.5,d,'paint',body)
      lower.profile=[[-.5,-.25],[-.48,.25],[-.35,.5],[.37,.5],[.5,.1],[.49,-.5]]
      // Wheel arches cut into the complete body shell. The collider consumes
      // this same closed mesh, including rounded corners and the roof taper.
      const wheelAngle=Math.asin((.43-.30)/.34)
      for(const center of [.32,-.32])for(let i=0;i<=10;i++){
        const angle=wheelAngle+(Math.PI-2*wheelAngle)*i/10
        lower.profile.push([center+Math.cos(angle)*.34/d,(.3+Math.sin(angle)*.34-.68)/.5])
      }
      lower.profile.push([-.48,-.5]);lower.bevel=.013;lower.nose=.08;lower.crown=.97
      for(const z of [-d*.32,d*.32])for(const x of [-w*.47,w*.47])wheel(x,z,.30)
      const cabin=b.box(0,1.1,0,w*.84,.74,d*.62,'sealedglass','#233c43');cabin.profile=[[-.5,-.5],[-.27,.5],[.27,.5],[.5,-.5]];cabin.bevel=.015;cabin.crown=.86
      const top=b.box(0,1.465,0,w*.73,.07,d*.35,'paint',body);top.profile=[[-.5,-.5],[-.46,.3],[-.3,.5],[.3,.5],[.46,.3],[.5,-.5]];top.bevel=.025
      for(const x of [-w*.423,w*.423])b.bar([x,.76,-d*.31],[x*.86,1.47,-d*.167],.032,'paint',body,false)
      for(const x of [-w*.423,w*.423])b.bar([x,.76,d*.31],[x*.86,1.47,d*.167],.038,'paint',body,false)
      for(const x of [-w*.425,w*.425])b.bar([x,.76,.03],[x*.86,1.47,.03],.028,'paint',body)
      for(const x of [-w*.42,w*.42]){b.box(x,.70,0,.035,.035,d*.88,'paint',body);b.box(x,.79,-d*.34,.16,.035,.035,'metal','#35484c');b.box(x,.92,-d*.34,.12,.035,.035,'metal','#35484c')}
      for(const x of [-w*.2,w*.2]){b.box(x,.78,-d/2-.006,w*.2,.14,.018,'paint','#ded9bf');b.box(x,.78,d/2+.006,w*.2,.14,.018,'paint','#9b4c3f')}
      for(const side of [-1,1]){b.box(0,.40,side*(d/2+.018),w*.9,.10,.05,'metal');b.panel(0,.56,side*(d/2+.022),.33,.1,'paper','#dfdcc1')}
      b.panel(0,.71,-d/2-.019,w*.30,.14,'rubber','#202728')
      for(let i=0;i<7;i++)b.box((i-3)*w*.039,.71,-d/2-.024,.012,.12,.008,'metal','#707d7e',false)
      for(const x of [-w*.54,w*.54]){b.bar([x*.88,1.03,-d*.29],[x,1.08,-d*.29],.015);b.box(x,1.1,-d*.29,.10,.10,.19,'plastic','#3c4846')}
      for(const x of [-w*.2,w*.2])b.bar([x,.81,-d*.296],[x+.17,1.04,-d*.251],.008,'rubber','#3c4846',false)
      for(const side of [-1,1])for(const z of [-d*.31,.03,d*.3])b.box(side*w*.493,.69,z,.009,.4,.012,'rubber','#37413f',false)
      for(const side of [-1,1])for(const z of [-d*.04,d*.23])b.box(side*w*.498,.84,z,.022,.034,.16,'metal','#808783',false)
      if(key==='taxi')b.box(0,H-.065,0,.46,.13,.2,'paint','#d4c881',false)
      break
    }
    case 'delivery_van':case 'box_truck':case 'bus':{
      const bus=key==='bus',truck=key==='box_truck',van=key==='delivery_van',body=truck?'#a6aaa3':bus?'#637f80':'#b7b9ad'
      b.box(0,.38,0,w*.9,.23,d*.92,'rubber','#333e3f');b.box(0,.7,0,w,.55,d,'paint',body)
      for(const z of [-d*.32,d*.32])for(const x of [-w*.48,w*.48])wheel(x,z,truck||bus?.36:.29)
      if(truck){
        b.box(0,H*.64,d*.1,w*.98,H*.65,d*.74,'paint','#d2d0bf');b.box(0,1.32,-d*.38,w,1.16,d*.24,'paint',body)
        b.panel(0,1.58,-d*.505,w*.83,.47,'sealedglass','#839896')
        for(const x of [-w*.496,w*.496]){b.box(x,H*.64,d*.1,.025,.035,d*.7,'metal');b.panel(x,1.6,-d*.38,d*.18,.45,'sealedglass','#839896').ry=Math.PI/2}
        for(const x of [-w*.245,w*.245]){b.box(x,H*.6,d*.473,w*.475,H*.6,.027,'paint','#c8c7b9');b.bar([x,H*.31,d*.495],[x,H*.89,d*.495],.016);b.box(x+.09,H*.54,d*.505,.16,.028,.025,'metal')}
      } else {
        const z=bus?0:van?.05:.03,upper=bus?d*.94:van?d*.88:d*.58
        b.box(0,(H+.9)/2,z,w*.94,H-.9,upper,'paint',body)
        for(const side of [-1,1])b.panel(0,H*.71,z+side*(upper/2+.014),w*.84,H*.28,'sealedglass','#839896')
        for(const side of [-1,1]){
          b.panel(side*w*.474,H*.72,z,upper*.92,H*.3,'sealedglass','#839896').ry=Math.PI/2
          const count=bus?8:van?3:3;for(let i=0;i<count;i++)b.box(side*w*.484,H*.72,z-upper*.43+i*upper*.86/(count-1),.026,H*.36,.05,'paint',body)
          for(let i=0;i<2;i++){b.box(side*w*.503,.94,-d*.1+i*.7,.025,.035,.18,'metal');b.box(side*w*.505,.68,-d*.23+i*d*.29,.006,.4,.012,'rubber','#3d4a47',false)}
          b.box(side*w*.505,.47,0,.025,.045,d*.84,'rubber','#3d4a47',false)
        }
      }
      for(const x of [-w*.35,w*.35]){b.panel(x,.72,-d/2-.015,w*.18,.14,'paint','#e0dec7');b.panel(x,.73,d/2+.015,w*.13,.17,'paint','#9b4c3f')}
      for(const side of [-1,1]){b.box(0,.4,side*(d/2+.018),w*.9,.10,.05,'metal');b.panel(0,.56,side*(d/2+.022),.33,.1,'paper','#dfdcc1')}
      for(const x of [-w*.54,w*.54]){b.bar([x*.88,1.03,-d*.29],[x,1.08,-d*.29],.015);b.box(x,1.1,-d*.29,.10,.10,.19,'plastic','#3c4846')}
      for(const x of [-w*.2,w*.2])b.bar([x,H*(truck?.52:.63),-d*.505],[x+.13,H*(truck?.58:.74),-d*.505],.008,'rubber','#3c4846',false)
      break
    }
    default:return false
  }
  return true
}
