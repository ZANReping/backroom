import type { Structure } from '../core/types'
import type { AlphaPart, AlphaSurface } from './alphaDecor'

/** Research furniture, authored from the supplied laboratory / office / specimen references. */
export const RESEARCH_NAMES = {
 alpha_labbench:'木抽屉不锈钢实验台', alpha_fumehood:'不锈钢通风操作柜', alpha_lab_island:'实验岛台与记录器具',
 alpha_lab_shelf:'实验室试剂文献壁架', alpha_lab_duct:'实验室吊装风管与轨道灯', alpha_extractor:'柔性局部排风臂',
 alpha_microscope:'显微镜与检测仪', alpha_office_station:'蓝色吊柜研究员工位', alpha_climate:'办公室空调与除湿机',
 alpha_sample_rack:'分类抽屉样品与器械架', alpha_cold_cabinet:'样品冷藏柜',
 alpha_entry_portal:'Alpha 双扇检查门与返程标识',
} as const
export const RESEARCH_DIMENSIONS:Record<keyof typeof RESEARCH_NAMES,[number,number,number,boolean]>={
 alpha_labbench:[3,.8,.94,true],alpha_fumehood:[3.4,.9,3.65,true],alpha_lab_island:[3.6,1.1,.9,true],
 alpha_lab_shelf:[3,.32,1.3,false],alpha_lab_duct:[4,.7,.65,false],alpha_extractor:[2.3,.5,1.55,false],
 alpha_microscope:[.8,.5,.56,false],alpha_office_station:[1.6,.65,2.28,true],alpha_climate:[.9,.3,.48,false],
 alpha_sample_rack:[2.4,.78,2.2,true],alpha_cold_cabinet:[1.35,.8,2.2,true],
 alpha_entry_portal:[1.8,.24,2.65,true],
}
export function researchParts(s:Structure):AlphaPart[]{
 const a:AlphaPart[]=[],w=s.w,d=s.h,z=Number(s.data?.z??0),skin=String(s.data?.skin??''),label=String(s.data?.label??'BIO / 145')
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',color='#d7d8cb',solid=false,shape?:AlphaPart['shape'],panel?:AlphaPart['panel'],text?:string)=>{
  if(ww>0&&dd>0&&h>0)a.push({x,y,z:zz+z,w:ww,d:dd,h,surface,color,solid,shape,panel,text})
 }
 const bottle=(x:number,y:number,zz:number,r=.055,h=.19,amber=false)=>{
  B(x,y,zz,r*2,r*2,h,'glass',amber?'#b29656':'#d2dace',false,'rod')
  B(x+.013,y+.013,zz+.012,r*2-.026,r*2-.026,h*.58,'plastic',amber?'#947038':'#cfbd86',false,'rod')
  B(x-.002,y-.002,zz+h-.005,r*2+.004,r*2+.004,.026,'metal','#b49a47',false,'rod')
  B(x+.012,y+r*2+.001,zz+h*.27,r*2-.024,.003,h*.46,'paint','#e8e2cf',false,undefined,'label','A-239')
 }
 const cabinet=(ww=w,dd=d)=>{
  B(.04,.025,.09,ww-.08,dd-.04,.75,'paint','#ab7f44',true)
  B(.035,dd-.02,.09,ww-.07,.035,.10,'paint','#685639')
  const n=Math.max(1,Math.round(ww/.58)),cw=(ww-.1)/n
  for(let col=0;col<n;col++)for(let row=0;row<3;row++){
   const x=.05+col*cw,zz=.2+row*.208
   B(x,dd+.002,zz,cw-.014,.023,.195,'wood','#c49b59')
   B(x+cw*.32,dd+.03,zz+.142,cw*.36,.026,.018,'steel','#bac0b8')
   B(x+.045,dd+.027,zz+.045,.09,.002,.036,'paint','#e6dbc3')
  }
  B(0,0,.855,ww,dd+.025,.055,'steel','#bcc4bb',true)
  B(0,0,.91,ww,.045,.09,'steel','#a2ada4')
 }
 const computer=(x:number,y:number)=>{
  B(x+.15,y+.10,.78,.3,.23,.024,'plastic','#252b29',false,'round');B(x+.28,y+.16,.8,.05,.045,.15,'plastic','#202824')
  B(x,y,.95,.62,.045,.39,'plastic','#1d2523');B(x+.027,y+.047,.976,.566,.004,.332,'paint','#bdd3c4',false,undefined,'research_screen')
  B(x-.01,y+.23,.782,.59,.18,.028,'plastic','#232a28');for(let j=0;j<4;j++)for(let i=0;i<11;i++)B(x+.01+i*.05,y+.245+j*.036,.811,.035,.021,.005,'paint','#7e8278')
  B(x+.69,y+.27,.79,.075,.11,.035,'plastic','#272e2a',false,'round')
 }
 switch(s.kind){
 case 'alpha_labbench':
  cabinet();
  if(skin==='sink'){
   B(w-.88,.19,.916,.69,.45,.022,'paint','#586864');B(w-.84,.23,.929,.61,.36,.01,'steel','#9eaaa3')
   B(w-.53,.09,.92,.045,.045,.36,'steel','#c1cbc4',false,'rod');B(w-.53,.09,1.24,.045,.29,.04,'steel','#c1cbc4')
  }
  for(let i=0;i<3;i++)bottle(.14+i*.22,.17,.913,.055,.17+i*.025,true)
  B(w*.45,.18,.914,.3,.24,.16,'plastic','#e4e4d4');B(w*.45+.08,.42,.94,.12,.003,.075,'paint','#63919d',false,undefined,'label','GLOVES')
  break
 case 'alpha_fumehood':
  cabinet();B(0,0,.94,w,.045,1.19,'steel','#a8b3a8')
  for(const x of [0,w-.06])B(x,0,.94,.06,d,1.21,'steel','#aeb8af',true)
  B(0,0,2.15,w,d,.34,'steel','#bcc3b7');B(.08,d-.07,2.11,w-.16,.065,.07,'steel','#87968d')
  B(.18,.18,2.115,w-.36,.05,.018,'light','#fff2d2');B(w*.42,.10,2.49,w*.16,.49,1.16,'steel','#9eaba3')
  for(let i=0;i<3;i++)B(.18+i*.52,d+.003,2.21,.28,.005,.21,'paint','#ebe7d3',false,undefined,'lab_paper')
  B(.25,.19,.924,.72,.38,.045,'plastic','#b8c1b0');bottle(w-.43,.35,.912,.07,.27)
  B(w-.68,.12,.92,.025,.025,.43,'steel','#b4c5bc',false,'rod');B(w-.82,.12,1.32,.17,.045,.055,'plastic','#202b27')
  break
 case 'alpha_lab_island':
  for(const x of [.08,w-.13])for(const y of [.08,d-.13])B(x,y,0,.045,.045,.84,'steel','#68776f',true)
  B(.08,.08,.19,w-.16,d-.16,.04,'steel','#7d8980');B(0,0,.84,w,d,.06,'paint','#dce4d6',true)
  B(.16,.13,.9,.65,.46,.012,'paint','#e5d8b0',false,undefined,'lab_paper')
  B(w*.53,.17,.9,.4,.28,.035,'plastic','#9f6c3a');B(w*.54,.19,.935,.34,.23,.018,'paint','#d3c4a0')
  B(w-.57,d-.29,.91,.19,.12,.035,'plastic','#d0b958',false,'round');B(w-.35,d-.29,.91,.19,.12,.035,'glass','#c4d8c4',false,'round')
  bottle(w-.31,.15,.9,.05,.19);break
 case 'alpha_lab_shelf':
  for(const x of [0,w-.035])B(x,0,0,.035,d,1.25,'metal','#293732')
  for(const zz of [0,.55,1.13]){
   B(0,0,zz,w,d,.028,'metal','#293732')
   if(zz<1)for(let i=0;i<Math.floor(w/.14)-1;i++){
    const x=.075+i*.14
    if(i%7<4){B(x,.04,zz+.03,.085,d-.10,.30+(i%3)*.025,'paint',['#873f37','#273d35','#a2956a'][i%3]);B(x+.009,d-.05,zz+.07,.065,.004,.065,'paint','#dedcca')}
    else bottle(x,.07,zz+.03,.045,.25,i%2===0)
   }
  }
  B(.04,.15,-.045,w-.08,.065,.035,'light','#fff9e1');break
 case 'alpha_lab_duct':
  B(0,.06,.27,w,d-.12,.33,'steel','#aeb7ad')
  for(let x=.07;x<w;x+=.65){B(x,.04,.245,.035,d-.08,.38,'steel','#737f75');B(x,d*.48,.57,.024,.024,.15,'metal','#4c5850')}
  for(let x=.35;x<w-.1;x+=1.1){B(x,d+.05,.1,.045,.045,.44,'paint','#e1dfc5');B(x-.045,d,.02,.15,.16,.12,'paint','#dfdfc5',false,'rod');B(x-.025,d+.02,0,.11,.12,.02,'light','#fff2cf',false,'rod')}
  break
 case 'alpha_extractor':
  // Overlapping ribbed hose sections trace the hanging extraction arm without a rigid diagonal box.
  for(let i=0;i<41;i++){
   const t=i/40,x=.05+t*(w-.34),zz=1.3-Math.pow(t,1.7)*1.12
   B(x,.13,zz,.21,.21,.16,'plastic',i%2?'#1b241f':'#353f36',false,'globe')
  }
  B(w-.38,.06,.05,.36,.38,.13,'metal','#25352c');B(.05,.16,1.28,.075,.075,.25,'metal','#7c8b7c');break
 case 'alpha_microscope':
  B(.05,.06,0,.30,.36,.045,'paint','#d7dcca',false,'round');B(.10,.07,.03,.075,.10,.32,'paint','#cbd4c4');B(.17,.11,.30,.15,.15,.07,'paint','#e2e4d2')
  B(.20,.13,.37,.048,.055,.15,'plastic','#253c32',false,'rod');B(.17,.14,.18,.22,.19,.03,'paint','#253e33')
  B(.23,.18,.25,.028,.028,.10,'steel','#bac4b7',false,'rod');B(.44,.10,0,.32,.31,.23,'paint','#d3d8c9');B(.47,.415,.06,.25,.004,.13,'paint','#8bb6a4',false,undefined,'research_screen');break
 case 'alpha_office_station':
  for(const x of [.03,w-.065])B(x,.03,0,.035,d-.03,.75,'metal','#7a8780',true)
  B(0,0,.75,w,d,.035,'paint','#bfc9ad',true);B(.08,.07,0,.32,.43,.60,'paint','#465753',true)
  computer(.30,.10)
  B(0,0,1.48,w,.30,.028,'paint','#aabbb2');B(0,0,2.27,w,.30,.025,'paint','#aabbb2')
  for(const x of [0,w/2,w-.028])B(x,0,1.48,.028,.30,.79,'paint','#aabbb2')
  for(const x of [.027,w/2+.015]){B(x,.28,1.94,w/2-.04,.024,.33,'paint','#507ead');B(x+w/4-.04,.311,1.99,.09,.017,.017,'metal','#cbd0c2')}
  for(let i=0;i<8;i++){B(.08+i*.095,.04,1.51,.069,.23,.28,'paint',i%3===0?'#ab865c':'#c9cbaf');B(.086+i*.095,.273,1.53,.05,.003,.08,'paint','#e8e6d4')}
  B(w-.17,.38,.789,.09,.09,.095,'paint','#d2d4b9',false,'rod');break
 case 'alpha_climate':
  if(skin==='portable'){
   B(0,0,0,w,d,.64,'paint','#d0d4b9',true,'round');for(let i=0;i<12;i++)B(.06,d+.002,.16+i*.025,w-.12,.006,.009,'paint','#657567')
   B(.08,d+.006,.52,w-.16,.008,.065,'paint','#a5b3a0')
  }else{B(0,0,0,w,d,.43,'paint','#dde0c5',false,'round');B(.07,d+.001,.07,w-.14,.006,.09,'paint','#818f7b');for(let j=0;j<4;j++)B(.075,d+.008,.074+j*.022,w-.15,.014,.008,'paint','#bdc8b0')}
  break
 case 'alpha_sample_rack':{
  for(const x of [0,w-.04])for(const y of [0,d-.04])B(x,y,0,.04,.04,2.2,'steel','#7d8980',true)
  const n=3,bw=(w-.1)/n
  for(let row=0;row<5;row++){
   const zz=.08+row*.415;B(0,0,zz,w,d,.03,'steel','#939e91',true)
   for(let col=0;col<n;col++){
    const x=.05+col*bw,front=row===2&&col===1,dy=front?.23:0
    B(x,.03+dy,zz+.035,bw-.03,d-.08,.025,'plastic','#c2c2aa')
    B(x,d-.03+dy,zz+.035,bw-.03,.009,.29,'glass','#d5d8c7')
    for(const xx of [x,x+bw-.04])B(xx,.03+dy,zz+.04,.009,d-.08,.27,'glass','#c3cbb9')
    if(skin==='instruments'){
     B(x+.06,.08+dy,zz+.07,bw-.15,.37,.19,'plastic',row%2?'#b6bfb2':'#d4d4bd');B(x+.12,.16+dy,zz+.26,bw-.28,.035,.014,'steel','#78887d')
    }else for(let iy=0;iy<3;iy++)for(let ix=0;ix<4;ix++)bottle(x+.025+ix*(bw-.08)/4,.06+dy+iy*.18,zz+.065,.045,.21,skin==='reagents')
    if(!front){B(x+.014,d-.019+dy,zz+.08,bw-.058,.005,.16,'paint','#dedccb',false,undefined,'label',`${label} / ${141+row*n+col}`)}
    else B(x+.012,d-.018+dy,zz+.048,bw-.055,.005,.048,'paint','#e4dfcf',false,undefined,'label',label+' / OPEN')
   }
  }
  break
 }
 case 'alpha_cold_cabinet':
  B(0,0,0,w,d,2.2,'paint','#c3d0c8',true)
  B(.07,d+.005,.28,w-.14,.013,1.62,'paint','#536961')
  for(let row=0;row<4;row++){
   const zz=.34+row*.36;B(.12,d+.025,zz,w-.24,.025,.025,'steel','#b9c5b8')
   for(let i=0;i<5;i++)bottle(.14+i*(w-.3)/5,d+.037,zz+.03,.037,.20)
  }
  B(.065,d+.13,.27,w-.13,.016,1.65,'glass','#a6c9c0');B(w-.115,d+.158,.94,.035,.045,.43,'steel','#bbc9bd')
  B(.1,d+.012,1.98,w-.2,.008,.13,'paint','#213d37',false,undefined,'label','SAMPLES / +4 C');break
 case 'alpha_entry_portal':
  for(const x of [0,w-.075])B(x,0,0,.075,d,2.4,'steel','#7b8c85',true)
  B(0,0,2.34,w,d,.09,'steel','#89998e',true)
  for(const x of [.08,w/2+.012]){
   const ww=w/2-.092;B(x,.045,.025,ww,.085,2.29,'paint','#667d75',true)
   B(x+.11,.134,1.24,ww-.22,.018,.66,'steel','#b4c3b8');B(x+.145,.154,1.275,ww-.29,.007,.59,'paint','#657b79')
   B(x+.145,.163,1.275,ww-.29,.007,.59,'glass','#a5c5bc')
   B(x+.08,.135,.97,ww-.16,.07,.045,'steel','#cad1be');B(x+.06,.134,.10,ww-.12,.012,.19,'steel','#9aaca1')
  }
  B(w*.18,.055,2.46,w*.64,.10,.17,'paint','#386b5b')
  B(w*.19,.157,2.47,w*.62,.004,.145,'paint','#dbe5cf',false,undefined,'label','LEVEL 1 / EXIT')
  break
 }
 return a
}
