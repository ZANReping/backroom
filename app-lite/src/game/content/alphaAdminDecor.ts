import type { Structure } from '../core/types'
import type { AlphaPart, AlphaSurface, AlphaPanel } from './alphaDecor'

export const ADMIN_NAMES={
 alpha_reception_counter:'行政署深木接待前台',alpha_waiting_seats:'行政署穿孔金属联排候座',alpha_queue_rail:'行政署不锈钢导流栏',alpha_admin_cove:'行政署灯槽与格井吊顶',
 alpha_hall_seat:'大会厅翻折式扶手座椅',alpha_hall_tier:'大会厅可步行阶梯台',alpha_hall_screen:'大会厅投影幕与教学板',alpha_hall_podium:'大会厅讲台与演示设备',
 alpha_parcel_stack:'封箱胶带包裹与托盘',alpha_sorting_rack:'贸易中转分拣货架',alpha_parcel_cart:'贸易中转包裹手推车',alpha_dispatch_desk:'贸易中转登记与失物柜台',
 alpha_executive_desk:'监督者木制办公桌',alpha_executive_bookcase:'监督者书柜与文件边柜',alpha_executive_sofa:'监督者会客沙发',alpha_executive_chair:'监督者高背办公椅',alpha_admin_rug:'行政署会客区织物地毯',
} as const
export const ADMIN_DIMENSIONS:Record<keyof typeof ADMIN_NAMES,[number,number,number,boolean]>={
 alpha_reception_counter:[4.2,2,1.22,true],alpha_waiting_seats:[3.2,1.15,.97,true],alpha_queue_rail:[3,.20,1.05,true],alpha_admin_cove:[7.4,9.8,.55,false],
 alpha_hall_seat:[.72,.85,1.05,true],alpha_hall_tier:[18,1.8,.12,true],alpha_hall_screen:[6,.18,3.8,false],alpha_hall_podium:[1.2,.72,1.16,true],
 alpha_parcel_stack:[1.45,1.15,1.95,true],alpha_sorting_rack:[3,.65,2.4,true],alpha_parcel_cart:[1.1,.85,1.5,true],alpha_dispatch_desk:[2.2,.85,1.25,true],
 alpha_executive_desk:[3.2,1.1,1.22,true],alpha_executive_bookcase:[3,.44,2.4,true],alpha_executive_sofa:[2.5,.9,.9,true],alpha_executive_chair:[.76,.78,1.26,true],alpha_admin_rug:[6,4,.025,false],
}
export function adminParts(s:Structure):AlphaPart[]{
 const a:AlphaPart[]=[],w=s.w,d=s.h,z=Number(s.data?.z??0),H=Number(s.data?.height??ADMIN_DIMENSIONS[s.kind as keyof typeof ADMIN_NAMES][2])
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',color='#dedccd',solid=false,shape?:AlphaPart['shape'],panel?:AlphaPanel,text?:string)=>{
  if(ww>0&&dd>0&&h>0)a.push({x,y,z:z+zz,w:ww,d:dd,h,surface,color,solid,shape,panel,text})
 }
 const wood='#695039',chrome='#bec7c1'
 const paper=(x:number,y:number,zz:number,ww=.23,dd=.3)=>{B(x,y,zz,ww,dd,.015,'paint','#e3dece');for(let i=0;i<4;i++)B(x+.02,y+.04+i*.035,zz+.015,ww*.7,.002,.001,'paint','#6b7872')}
 const computer=(x:number,y:number,zz:number)=>{
  B(x+.08,y+.04,zz,.24,.18,.02,'plastic','#404b48');B(x+.18,y+.08,zz+.02,.04,.05,.13,'metal','#6d7972');B(x,y+.06,zz+.12,.42,.055,.29,'plastic','#3b4745')
  B(x+.025,y+.116,zz+.145,.37,.004,.235,'paint','#dce5d9',false,undefined,'admin_screen');B(x-.01,y+.25,zz,.40,.13,.018,'plastic','#464f4a');for(let i=0;i<3;i++)for(let j=0;j<11;j++)B(x+.005+j*.035,y+.265+i*.033,zz+.02,.024,.022,.006,'plastic','#a6aea1')
 }
 const phone=(x:number,y:number,zz:number)=>{B(x,y,zz,.19,.22,.045,'plastic','#27322d',false,'round');B(x+.015,y+.01,zz+.045,.045,.20,.032,'plastic','#17211d',false,'round');for(let i=0;i<12;i++)B(x+.08+(i%3)*.028,y+.075+Math.floor(i/3)*.028,zz+.049,.022,.022,.008,'plastic','#acb2a5')}
 const parcel=(x:number,y:number,zz:number,ww:number,dd:number,hh:number,variant=0)=>{
  const wrapped=variant%3===0,color=wrapped?'#b39957':variant%2?'#bca173':'#c2ad86'
  B(x,y,zz,ww,dd,hh,wrapped?'packing_tape':'cardboard',wrapped?'#b99b34':color,true)
  if(wrapped)for(let row=0;row<4;row++){
   B(x,y-.004,zz+hh*(row+.1)/4,ww,.006,hh*.23,'packing_tape',row%2?'#c2a331':'#b49429')
   B(x,y+dd+.002,zz+hh*(row+.1)/4,ww,.006,hh*.23,'packing_tape',row%2?'#c2a331':'#b49429')
  }
  B(x+ww*.49,y,zz+hh+.002,.004,dd,.002,'paint','#766747')
  const tape=wrapped?.16:.08
  for(const xx of (wrapped?[x+ww*.14,x+ww*.67]:[x+ww*.46])){
   B(xx,y-.003,zz+.004,ww*tape,.005,hh-.004,'packing_tape',wrapped?'#ccaa24':'#ac975b')
   B(xx,y,zz+hh+.004,ww*tape,dd,.005,'packing_tape',wrapped?'#d5b430':'#b29d65')
   B(xx,y+dd+.002,zz+.004,ww*tape,.005,hh-.004,'packing_tape',wrapped?'#ccaa24':'#ac975b')
  }
  if(wrapped){B(x-.002,y-.004,zz+hh*.38,ww+.004,.008,.075,'packing_tape','#c5a126');B(x-.002,y,zz+hh*.38,.007,dd,.075,'packing_tape','#c5a126')}
  B(x+ww*.25,y+dd+.011,zz+hh*.38,ww*.43,.003,hh*.36,'paint','#eae6d7',false,undefined,'shipping_label',String(s.data?.label??(variant%2?'MEG / L3':'ALPHA / IN')))
 }
 const post=(x:number,y:number,h:number)=>{B(x-.035,y-.035,.035,.07,.07,h,'steel',chrome,true,'rod');B(x-.11,y-.11,.014,.22,.22,.022,'steel',chrome,false,'rod')}
 switch(s.kind){
 case 'alpha_reception_counter':{
  B(0,d-.56,.05,w,.50,.96,'wood',wood,true);B(0,0,.05,.5,d-.5,.96,'wood',wood,true);B(w-.5,0,.05,.5,d-.5,.96,'wood',wood,true)
  B(-.01,d-.60,1.01,w+.02,.63,.07,'laminate','#353f35',true);for(const x of [-.01,w-.54])B(x,0,1.01,.55,d-.58,.07,'laminate','#353f35',true)
  B(.05,d-.039,.18,w-.10,.03,.49,'paint','#bab7a2');for(const x of [.2,w-.24])B(x,d-.05,.12,.04,.04,.83,'metal','#9a9b84')
  B(.6,.24,.75,w-1.2,.67,.046,'laminate','#b6b5a0',true);computer(.95,.29,.796);phone(w-1.13,.49,.80);paper(2.0,.50,.80)
  B(w*.61,d+.002,.80,w*.30,.016,.16,'paint','#e8dfb8',false,undefined,'label','INFORMATION')
  break
 }
 case 'alpha_waiting_seats':{
  B(.12,.42,.32,w-.24,.07,.08,'cabinet_metal','#3c4945',true)
  for(const x of [.23,w-.3])for(const y of [.13,.89])B(x,y,0,.04,.05,.44,'metal','#586761',true)
  const n=4,cw=(w-.12)/n
  for(let i=0;i<n;i++){
   const x=.06+i*cw
   B(x,.18,.44,cw-.09,.58,.035,'perforated_metal','#d6d6c4',true,'round')
   B(x,.12,.49,cw-.09,.036,.43,'perforated_metal','#d9d9c7',true,'round')
   for(const xx of [x-.025,x+cw-.085]){B(xx,.10,.48,.032,.032,.26,'metal','#d3d6c9');B(xx,.11,.71,.036,.70,.032,'metal','#d3d6c9',false,'round');B(xx,.78,.45,.032,.032,.28,'metal','#d3d6c9')}
  }
  break
 }
 case 'alpha_queue_rail':
  for(const x of [.13,w-.13])post(x,d/2,.99)
  B(.13,d/2-.018,.99,w-.26,.036,.038,'steel',chrome,true,'round');break
 case 'alpha_admin_cove':{
  // Suspended perimeter, concealed luminous band and recessed square coffers.
  for(const y of [0,d-.48]){B(0,y,-.36,w,.48,.34,'plaster','#d7d4bc');B(.14,y+(y===0?.43:-.05),-.17,w-.28,.10,.045,'light','#fff5c9')}
  for(const x of [0,w-.48]){B(x,.48,-.36,.48,d-.96,.34,'plaster','#d7d4bc');B(x+(x===0?.43:-.05),.52,-.17,.10,d-1.04,.045,'light','#fff5c9')}
  for(let x=.60;x<w-.60;x+=.60)for(let y=.60;y<d-.60;y+=.60){
   const ww=Math.min(.6,w-.6-x),dd=Math.min(.6,d-.6-y)
   B(x,y,-.04,ww,dd,.03,'paint','#c9c9b7')
   for(const dy of [0,Math.max(.03,dd-.04)])B(x,y+dy,-.14,ww,.04,.1,'paint','#ece8d2')
   for(const dx of [0,Math.max(.03,ww-.04)])B(x+dx,y,-.14,.04,dd,.1,'paint','#e6e3ce')
  }break
 }
 case 'alpha_hall_seat':{
  B(.085,.10,.42,w-.17,.53,.08,'office_fabric','#647775',true,'round');B(.065,d-.20,.45,w-.13,.12,.60,'plastic','#344240',true,'round')
  B(.085,d-.211,.50,w-.17,.023,.48,'office_fabric','#536a68')
  for(const x of [.025,w-.065]){B(x,.17,.04,.035,.52,.045,'metal','#5b6258');B(x,.28,.08,.035,.04,.61,'metal','#697369',true);B(x-.014,.13,.69,.065,.61,.036,'wood','#b39758')}
  B(.09,.13,.765,w-.18,.29,.021,'laminate','#b9c5aa');break
 }
 case 'alpha_hall_tier':{
  B(0,0,0,w,d,H,'carpet','#8c9a8a',true);a[a.length-1].stand=true
  B(0,0,H-.025,w,.035,.025,'paint','#bdc2a9');break
 }
 case 'alpha_hall_screen':
  B(w*.12,0,1.04,w*.75,.12,2.54,'metal','#697870');B(w*.12+.045,.124,1.085,w*.75-.09,.012,2.43,'paint','#e4e7d5',false,undefined,'admin_projection')
  B(w*.12-.045,-.01,3.57,w*.75+.09,.18,.10,'metal','#d6daca');B(w*.12,.13,1.035,w*.75,.025,.035,'metal','#77837a')
  B(0,.005,1.1,w*.09,.08,2.23,'paint','#27352e');break
 case 'alpha_hall_podium':
  B(0,0,.04,w,d,.07,'wood',wood,true);B(.10,.10,.11,w-.2,d-.2,.86,'wood','#91744b',true);B(-.01,-.01,.97,w+.02,d+.02,.06,'laminate','#ac9466',true)
  B(.13,.10,1.04,.40,.28,.025,'plastic','#303b38');B(.15,.09,1.06,.35,.03,.10,'plastic','#50685c');paper(w-.45,.18,1.035)
  B(w-.13,d-.12,1.035,.018,.018,.12,'metal','#24312b',false,'rod');break
 case 'alpha_parcel_stack':{
  for(const y of [.04,d-.20])B(.03,y,.01,w-.06,.16,.10,'wood','#796947',true)
  for(let i=0;i<6;i++)B(.025+i*(w-.05)/6,.01,.11,(w-.075)/6-.012,d-.02,.045,'wood','#99845e')
  const v=Number(s.data?.variant??0)
  parcel(.04,.035,.155,w*.54,d*.92,.68,v);parcel(w*.61,.06,.155,w*.35,d*.84,.60,v+1)
  parcel(.07,.05,.845,w*.84,d*.76,.59,v+2);parcel(w*.22,.11,1.443,w*.59,d*.66,.46,v+3);break
 }
 case 'alpha_sorting_rack':
  for(const x of [0,w-.045])for(const y of [0,d-.045]){B(x,y,0,.045,.045,H,'cabinet_metal','#76816a',true);for(let zz=.13;zz<H;zz+=.16)B(x+.01,y+.046,zz,.019,.003,.035,'paint','#344239')}
  for(let row=0;row<5;row++){
   const zz=.10+row*.44;B(0,0,zz,w,d,.03,'cabinet_metal','#7c8b70',true)
   for(let col=0;col<5;col++){
    const xx=.08+col*(w-.1)/5;B(xx,.06,zz+.032,(w-.20)/5-.03,d-.12,.32,'office_fabric',(col+row)%2?'#d9d8cb':'#c7c4b2')
    B(xx+.05,d-.052,zz+.13,.24,.008,.14,'paint','#eae7d8',false,undefined,'shipping_label',row%2?'SORT / A4':'MEG / L3')
   }
  }break
 case 'alpha_parcel_cart':
  B(.05,.04,.14,w-.10,d-.06,.07,'cabinet_metal','#746d43',true)
  for(const x of [.10,w-.18])for(const y of [.10,d-.2])B(x,y,.02,.14,.10,.15,'plastic','#30362c',false,'globe')
  for(const x of [.06,w-.105])B(x,d-.08,.15,.045,.045,1.30,'cabinet_metal','#444a30',true,'rod')
  B(.065,d-.082,1.415,w-.13,.05,.055,'cabinet_metal','#454a2e',true,'round')
  B(.065,d-.083,.95,w-.13,.045,.045,'cabinet_metal','#535736')
  parcel(.11,.06,.21,w-.22,d-.2,.52,0);parcel(.17,.09,.74,w-.34,d-.27,.41,2)
  B(.22,d-.025,1.03,w-.44,.013,.26,'paint','#e6e5d9',false,undefined,'label','M.E.G.');break
 case 'alpha_dispatch_desk':
  B(.03,.03,.06,w-.06,d-.06,.70,'cabinet_metal','#8b9280',true);B(0,0,.76,w,d,.055,'laminate','#bbbda6',true)
  computer(.18,.14,.82);paper(.84,.26,.82,.35,.36);B(w-.46,.17,.82,.30,.30,.19,'plastic','#697666');B(w-.42,.47,.91,.22,.004,.06,'paint','#e6e4c9',false,undefined,'label','RECEIPT')
  B(.13,d+.005,.31,w-.26,.01,.25,'paint','#d6dccb',false,undefined,'label','LOST & FOUND / 失物招领');break
 case 'alpha_executive_desk':{
  B(0,0,.74,w,d,.075,'wood','#745337',true);B(.12,d-.12,.10,w-.24,.11,.64,'wood','#684b32',true)
  for(const x of [.08,w-.69]){
   B(x,.05,.06,.61,d-.1,.66,'wood','#6e5035',true);for(let row=0;row<3;row++){B(x+.025,.032,.13+row*.18,.56,.018,.16,'wood','#816345');B(x+.24,.011,.20+row*.18,.14,.025,.018,'metal','#b1a479')}
  }
  B(.13,d-.015,.19,w-.26,.024,.47,'wood','#896a48');for(const x of [.22,w-.27])B(x,d+.01,.2,.05,.025,.43,'wood','#b29b6b')
  B(w*.29,.20,.818,w*.4,.6,.008,'plastic','#364c3f');paper(w*.48,.39,.83,.31,.36);phone(.25,.34,.82)
  B(w-.49,.26,.82,.21,.21,.04,'metal','#a69b66',false,'rod');B(w-.4,.345,.86,.026,.026,.34,'metal','#b8a777',false,'rod');B(w-.58,.20,1.13,.39,.25,.07,'plastic','#527665',false,'round')
  B(w*.34,d-.025,.832,.36,.045,.09,'wood','#71583c');B(w*.35,d+.021,.84,.34,.005,.06,'paint','#ccb889',false,undefined,'label','OVERSEER');break
 }
 case 'alpha_executive_bookcase':
  B(0,0,.08,w,.06,H-.08,'wood',wood,true);for(const x of [0,w-.07,w/2-.035])B(x,0,.02,.07,d,H-.02,'wood','#785c3f',true)
  for(const zz of [.08,.82,1.35,1.88,2.35])B(0,0,zz,w,d,.045,'wood','#8b6b48',true)
  for(let i=0;i<4;i++){B(.07+i*(w-.12)/4,d-.04,.14,(w-.22)/4,.045,.62,'wood','#755338');B(.21+i*(w-.12)/4,d+.012,.43,.07,.018,.025,'metal','#b3a679')}
  for(let row=0;row<3;row++)for(let i=0;i<15;i++){const x=.12+i*(w-.25)/15;B(x,.1,.87+row*.53,.085,.25,.31+(i%3)*.045,'office_fabric',['#62766f','#987d52','#344e61','#c0b396'][i%4])}
  break
 case 'alpha_executive_sofa':
  for(const x of [.12,w-.18])for(const y of [.13,d-.2])B(x,y,.02,.06,.06,.20,'wood',wood)
  B(.03,.08,.20,w-.06,d-.12,.22,'office_fabric','#c5c2a9',true,'round');B(.055,0,.38,w-.11,.16,.50,'office_fabric','#d4d0b9',true,'round')
  for(const x of [0,w-.15])B(x,.08,.39,.15,d-.16,.28,'office_fabric','#d1cdb5',true,'round')
  for(let i=0;i<3;i++)B(.17+i*(w-.32)/3,.17,.42,(w-.34)/3-.016,d-.29,.12,'office_fabric','#ddd6bb',true,'round');break
 case 'alpha_executive_chair':
  B(.07,.09,.45,w-.14,.54,.12,'plastic','#42473a',true,'round');B(.06,d-.19,.48,w-.12,.14,.75,'plastic','#353b33',true,'round')
  B(w/2-.028,d/2-.028,.09,.056,.056,.38,'metal','#8f9787',false,'rod');B(.025,d/2-.025,.08,w-.05,.05,.04,'metal','#8e9588');B(w/2-.025,.04,.08,.05,d-.08,.04,'metal','#8e9588')
  for(const x of [0,w-.05]){B(x,.19,.48,.035,.035,.25,'wood',wood);B(x-.01,.16,.72,.06,.43,.04,'wood','#8b704c')}
  for(const [x,y] of [[.03,d/2],[w-.10,d/2],[w/2,.04],[w/2,d-.11]])B(x,y,.02,.08,.075,.08,'plastic','#29352c',false,'globe');break
 case 'alpha_admin_rug':
  B(0,0,.004,w,d,.01,'carpet','#566b68');B(.12,.12,.015,w-.24,d-.24,.003,'carpet','#a69f7d')
  B(.19,.19,.018,w-.38,d-.38,.003,'carpet','#8f9880');break
 }
 return a
}
