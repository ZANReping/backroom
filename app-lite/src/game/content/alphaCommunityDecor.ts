import type { Structure } from '../core/types'
import type { AlphaPart, AlphaPanel, AlphaSurface } from './alphaDecor'

/** Shared corridor furniture; authored parts also define the walking collision. */
export const COMMUNITY_NAMES={
 alpha_postbox:'居民信格与投递箱',alpha_tea_cart:'公共茶水台与保温壶',alpha_swap_shelf:'居民图书和日用品交换架',alpha_mending_table:'缝补台与线轴',alpha_recycling:'分类回收桶组',alpha_drying_rack:'居民晾衣架',alpha_community_board:'社区手写留言板',alpha_rest_table:'走廊棋盘与休息桌',
} as const
export const COMMUNITY_DIMENSIONS:Record<keyof typeof COMMUNITY_NAMES,[number,number,number,boolean]>={
 alpha_postbox:[1.5,.32,1.55,true],alpha_tea_cart:[1.8,.58,1.3,true],alpha_swap_shelf:[1.6,.34,1.65,true],alpha_mending_table:[1.7,.65,1.05,true],alpha_recycling:[1.25,.43,.83,true],alpha_drying_rack:[1.5,.55,1.65,true],alpha_community_board:[1.9,.075,1.12,false],alpha_rest_table:[1.25,.8,.76,true],
}
export function communityParts(s:Structure):AlphaPart[]{
 const a:AlphaPart[]=[],w=s.w,d=s.h,z=Number(s.data?.z??0),H=Number(s.data?.height??COMMUNITY_DIMENSIONS[s.kind as keyof typeof COMMUNITY_NAMES][2])
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',color='#c4c2ad',solid=false,shape?:AlphaPart['shape'],panel?:AlphaPanel,text?:string)=>{if(ww>0&&dd>0&&h>0)a.push({x,y,z:z+zz,w:ww,d:dd,h,surface,color,solid,shape,panel,text})}
 const label=(text:string,x:number,y:number,zz:number,ww:number,hh:number)=>B(x,y,zz,ww,.008,hh,'paint','#e4debf',false,undefined,'label',text)
 const legs=(h:number)=>{for(const x of [.06,w-.1])for(const y of [.06,d-.1])B(x,y,0,.04,.04,h,'metal','#626b65',true)}
 const cup=(x:number,y:number,zz:number,c:string)=>{B(x,y,zz,.10,.10,.11,'paint',c,false,'rod');B(x+.08,y+.03,zz+.025,.045,.025,.06,'paint',c,false,'round');B(x+.012,y+.012,zz+.109,.076,.076,.003,'paint','#534531',false,'rod')}
 switch(s.kind){
 case 'alpha_postbox':
  B(0,0,0,w,d,H,'cabinet_metal','#6c877d',true)
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
   const x=.025+col*w/5,zz=.3+row*.38;B(x,d+.001,zz,w/5-.045,.015,.33,'paint','#879b8b');B(x+.04,d+.018,zz+.23,w/5-.12,.012,.026,'paint','#344b44')
   label(String(row*5+col+1).padStart(2,'0'),x+.08,d+.022,zz+.08,.12,.065)
   if((row+col)%3===0)B(x+.07,d+.026,zz+.21,.15,.016,.1,'paint','#ded7b6')
  }label('居民信格 / LETTERS',.07,d+.025,H-.12,w-.14,.09);break
 case 'alpha_tea_cart':
  legs(.82);B(0,0,.78,w,d,.055,'laminate','#b0a482',true);B(.04,.02,.15,w-.08,d-.04,.04,'wood','#8c795b',true)
  for(let i=0;i<2;i++){B(.12+i*.3,.08,.84,.22,.22,.39,'steel','#b1b9b0',false,'rod');B(.15+i*.3,.11,1.23,.16,.16,.045,'plastic','#444e46');B(.30+i*.3,.15,.99,.07,.10,.14,'plastic','#374c41')}
  for(let i=0;i<4;i++)cup(.86+i*.18,.26,.837,['#799586','#bd926e','#ced0b6','#8e9cab'][i])
  B(.76,.05,.84,.48,.16,.05,'wood','#8c7550');for(let i=0;i<6;i++)B(.8+i*.06,.08,.89,.042,.035,.055,'paint','#d1c5a3')
  B(.12,.06,.20,.47,.38,.35,'plastic','#5d776e');B(.78,.06,.20,.7,.4,.21,'fabric','#9c9b83');label('用完请洗杯 / TEA',.08,d+.008,.59,w-.16,.12);break
 case 'alpha_swap_shelf':
  for(const x of [0,w-.045])B(x,0,0,.045,d,H,'wood','#8b7859',true)
  B(0,0,0,w,.028,H,'wood','#a18a65',true)
  for(let row=0;row<4;row++){
   const zz=.10+row*.38;B(0,0,zz,w,d,.032,'wood','#aa9675',true)
   for(let j=0;j<10;j++){const x=.08+j*.125;B(x,.07,zz+.032,.08,.22,.20+(j%3)*.04,'fabric',['#8f6252','#819783','#bdad7f','#6d8199'][j%4]);B(x+.018,d-.045,zz+.08,.043,.007,.055,'paint','#d8d3b8')}
  }label('借走一本 留下一本',.08,d+.01,H-.11,w-.16,.10);break
 case 'alpha_mending_table':
  legs(.75);B(0,0,.73,w,d,.05,'wood','#ac9270',true);B(.20,.13,.78,.54,.29,.04,'metal','#343e3b');B(.26,.16,.82,.15,.20,.22,'metal','#3c4943');B(.28,.16,1.00,.42,.18,.045,'metal','#37433e');B(.64,.18,.85,.025,.025,.16,'metal','#8e9990')
  for(let i=0;i<4;i++)B(.92+i*.15,.12,.78,.08,.08,.11,'fabric',['#ab795f','#d2c3a2','#678975','#8a819a'][i],false,'rod')
  B(.84,.29,.786,.7,.28,.026,'fabric','#8c9eab');B(1.04,.31,.816,.4,.18,.018,'fabric','#b7b392');B(.12,.02,.13,.55,.45,.25,'plastic','#9b9578',true);label('邻里缝补 / REPAIR',.08,d+.008,.57,w-.16,.10);break
 case 'alpha_recycling':
  for(let i=0;i<3;i++){const x=i*w/3;B(x+.015,.02,0,w/3-.03,d-.04,H-.08,'plastic',['#6a8e81','#9b9868','#798e9d'][i],true);B(x,.005,H-.10,w/3-.01,d-.01,.06,'plastic','#394b44');B(x+.07,.06,H-.035,w/3-.15,d-.16,.018,'paint','#252f2b');label(['纸张','瓶罐','废弃物'][i],x+.06,d-.01,.43,w/3-.12,.13)}break
 case 'alpha_drying_rack':
  for(const x of [.04,w-.07]){B(x,.02,0,.025,.025,H,'metal','#99a59d',true,'rod');B(x,0,0,.035,d,.035,'metal','#7e8982',true)}
  for(const yy of [.02,d-.045])B(.04,yy,H-.03,w-.08,.022,.025,'metal','#bac3b5')
  for(let i=0;i<4;i++){const x=.12+i*.34;B(x,.03,H-.035,.014,d-.07,.02,'metal','#b0b7ad');B(x-.06,.07,H-.58,.26,.025,.54,'fabric',['#9caa9d','#b8b29a','#8f9aa9','#b5998e'][i]);B(x-.04,.052,H-.065,.025,.035,.07,'wood','#a98d60')}
  break
 case 'alpha_community_board':
  B(0,0,0,w,d,H,'wood','#79664d');B(.035,d+.004,.035,w-.07,.009,H-.07,'fabric','#ab9070')
  // One cached canvas per board, keeping pinned notes readable without many tiny textures.
  B(.07,d+.015,.075,w-.14,.008,H-.15,'paint','#dbcda9',false,undefined,'community',String(s.data?.label??'邻里留言|茶水角 请自备杯子|图书交换 每周三|寻物：蓝色手套|今晚一起吃饭'))
  if(s.data?.stand)for(const x of [.12,w-.15]){B(x,0,-z,.035,.035,z,'metal','#626d62');B(x-.10,-.16,-z,.24,.39,.03,'metal','#626d62')}
  break
 case 'alpha_rest_table':
  legs(.7);B(0,0,.70,w,d,.045,'wood','#a68a61',true);B(.28,.12,.747,.58,.58,.012,'wood','#d1bd8e')
  for(let row=0;row<8;row++)for(let col=0;col<8;col++)if((row+col)%2)B(.28+col*.0725,.12+row*.0725,.76,.0725,.0725,.001,'wood','#615442')
  for(let i=0;i<9;i++)B(.31+(i%5)*.10,.16+Math.floor(i/5)*.22,.766,.038,.038,.042,'wood',i%2?'#423f35':'#cbbd98',false,'rod')
  cup(.99,.16,.748,'#779181');B(.04,.36,.747,.17,.27,.025,'paint','#ddd4b9');break
 }
 return a
}
