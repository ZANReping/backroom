import type { Structure } from '../core/types'
import type { AlphaPart, AlphaPanel, AlphaSurface } from './alphaDecor'

/** Residential furniture shares the same metre-scale geometry and collision source. */
export const RESIDENTIAL_NAMES={
 alpha_mushroom_block:'菌菇生产压制菌棒',alpha_grow_station:'菌菇收获与培养记录台',alpha_library_shelf:'多媒体图书馆双面书架',alpha_library_terminal:'图书馆电脑与耳机工作台',alpha_library_counter:'图书馆借还服务柜台',alpha_reading_chair:'居民阅读扶手椅',alpha_library_soffit:'图书馆红色灯带吊楣',
 alpha_home_wardrobe:'居民衣柜与日用品',alpha_home_kitchen:'居民公共厨房',alpha_home_table:'居民餐桌与木椅',alpha_laundry:'洗衣机与折衣台',alpha_memorial:'阿谢儿·利沃纪念陈列',alpha_home_frame:'居民装框风景画',alpha_build_supplies:'扩建板材与施工物料',alpha_build_bench:'扩建木工作业台',alpha_build_barrier:'扩建工程围挡',alpha_aquila_column:'天鹰段混凝土柱与梁',
} as const
export const RESIDENTIAL_DIMENSIONS:Record<keyof typeof RESIDENTIAL_NAMES,[number,number,number,boolean]>={
 alpha_mushroom_block:[.64,.60,.74,true],alpha_grow_station:[2.4,.75,1.45,true],alpha_library_shelf:[2.4,.72,2.22,true],alpha_library_terminal:[1.5,.75,1.22,true],alpha_library_counter:[3,.85,1.15,true],alpha_reading_chair:[.86,.88,.9,true],alpha_library_soffit:[1.55,12,.22,false],
 alpha_home_wardrobe:[1.5,.56,2.05,true],alpha_home_kitchen:[3.8,.66,2.2,true],alpha_home_table:[2.3,1.8,.86,true],alpha_laundry:[2.6,.7,1.05,true],alpha_memorial:[2.2,.4,1.9,true],alpha_home_frame:[.9,.055,.62,false],alpha_build_supplies:[2.5,.85,1.2,true],alpha_build_bench:[2.2,.8,1.3,true],alpha_build_barrier:[2,.32,1.15,true],alpha_aquila_column:[.85,.85,3.6,true],
}
export function residentialParts(s:Structure):AlphaPart[]{
 const a:AlphaPart[]=[],w=s.w,d=s.h,z=Number(s.data?.z??0),H=Number(s.data?.height??RESIDENTIAL_DIMENSIONS[s.kind as keyof typeof RESIDENTIAL_NAMES][2]),skin=String(s.data?.skin??''),color=String(s.data?.color??'#9e8059')
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',c=color,solid=false,shape?:AlphaPart['shape'],panel?:AlphaPanel,text?:string)=>{if(ww>0&&dd>0&&h>0)a.push({x,y,z:z+zz,w:ww,d:dd,h,surface,color:c,solid,shape,panel,text})}
 const legs=(ww:number,dd:number,h:number,c='#686c63')=>{for(const x of [.05,ww-.09])for(const y of [.05,dd-.09])B(x,y,0,.04,.04,h,'metal',c,true)}
 const paper=(x:number,y:number,zz:number)=>{B(x,y,zz,.23,.3,.012,'paint','#e8e1ca');for(let i=0;i<5;i++)B(x+.025,y+.045+i*.037,zz+.013,.17,.003,.002,'paint','#737c71')}
 const mug=(x:number,y:number,zz:number)=>{B(x,y,zz,.09,.09,.10,'paint','#c4c4a6',false,'rod');B(x+.075,y+.025,zz+.025,.04,.025,.06,'paint','#c4c4a6',false,'round');B(x+.01,y+.01,zz+.098,.07,.07,.002,'paint','#473b2b',false,'rod')}
 const screen=(x:number,y:number,zz:number)=>{B(x+.12,y+.08,zz,.22,.19,.02,'plastic','#4f5753');B(x+.2,y+.06,zz+.02,.035,.04,.13,'metal','#7a827a');B(x,y,zz+.12,.47,.06,.32,'plastic','#313a38');B(x+.022,y+.061,zz+.144,.426,.004,.269,'paint','#c6d6cf',false,undefined,'library_screen');B(x-.04,y+.24,zz,.43,.15,.019,'plastic','#444d49');for(let i=0;i<3;i++)for(let j=0;j<12;j++)B(x-.026+j*.033,y+.25+i*.037,zz+.020,.024,.025,.006,'plastic','#abb2a4')}
 switch(s.kind){
 case 'alpha_mushroom_block':{
  const light=skin==='mycelium',v=Number(s.data?.variant??0),bw=w*.78,bd=d*.78,x=(w-bw)/2,y=(d-bd)/2
  B(x,y,.025,bw,bd,H*.92,'substrate',light?'#b9b3a0':'#342d1f',true,'round')
  // Compressed sawdust blocks on the floor, with uneven mycelial crust and side-fruiting caps.
  for(let i=0;i<9;i++){const xx=x+.03+((i*31+v*7)%83)/100*(bw-.1),yy=y+.03+((i*47+v*11)%79)/100*(bd-.1);B(xx,yy,H*.93,.06+(i%3)*.019,.06,.025,'substrate',light?'#e0d9bf':'#96856a',false,'globe')}
  for(let i=0;i<14;i++){
   const angle=(i*2.399+v*.47),rad=.36,xx=w/2+Math.cos(angle)*w*rad,yy=d/2+Math.sin(angle)*d*rad,zz=.10+((i*17+v*13)%57)/100*H,cap=.067+(i%4)*.014
   B(xx,yy,zz,.027,.028,.062,'fabric','#cab897',false,'rod');B(xx-cap*.36,yy-cap*.35,zz+.048,cap,cap*.91,.042,'fabric',i%3===0?'#85734d':'#b59c72',false,'globe')
  }break
 }
 case 'alpha_grow_station':
 case 'alpha_build_bench':{
  const grow=s.kind==='alpha_grow_station';legs(w,d,.81);B(0,0,.80,w,d,.065,grow?'steel':'wood',grow?'#aeb9aa':'#ad8655',true);B(.08,.08,.15,w-.16,d-.16,.04,'wood','#857355')
  B(.05,.025,.91,w-.1,.035,.39,'paint',grow?'#d7d9c5':'#b0a389',false,undefined,'label',grow?'CULTIVATION / HARVEST LOG':'ZEPHYR / WORK ORDER');paper(w-.45,.35,.867)
  for(let i=0;i<4;i++){B(.18+i*.21,.20,.865,.15,.17,.16,grow?'plastic':'wood',grow?'#c8cbb7':'#bc965c',false,'round');if(grow)B(.21+i*.21,.23,1.018,.09,.11,.007,'paint','#675337')}
  B(w*.52,.3,.87,.32,.21,.025,'metal','#777e70');B(w*.55,.31,.89,.19,.19,.055,'plastic','#dedbc4');break
 }
 case 'alpha_library_shelf':{
  B(0,0,0,w,d,.12,'cabinet_metal','#858e80',true);for(const x of [0,w-.045]){B(x,0,0,.045,d,H,'metal','#b8baaa',true);for(let h=.2;h<H;h+=.16)for(const yy of [.08,d-.1])B(x-.001,yy,h,.047,.022,.03,'paint','#5e6b61')}
  B(.05,d/2-.015,.12,w-.1,.03,H-.19,'paint','#c2c2a9',true)
  for(let row=0;row<5;row++){
   const zz=.17+row*.39;B(0,0,zz,w,d,.025,'metal','#c0c0ac',true)
   for(const side of [0,1])for(let col=0;col<Math.floor((w-.16)/.105);col++){
    const xx=.08+col*.105,hh=.22+((col*17+row*7)%9)*.013,folder=(row+col)%3===0||row===2,c=folder?'#e3dfcd':['#756449','#984f35','#b4a472','#547e78','#d4c7a7','#507792'][(col+row*3)%6]
    const yy=side?d-.28:.04;B(xx,yy,zz+.025,.084,.24,hh,'fabric',c)
    B(xx+.014,side?d-.036:.034,zz+.085,.055,.005,folder?.13:.035,'paint','#e5e1cf')
    if(folder)B(xx+.035,side?d-.03:.025,zz+.07,.018,.01,.018,'plastic','#606c63',false,'disc')
   }
  }
  B(.15,d+.002,2.08,w-.3,.009,.105,'paint','#e8e4d2',false,undefined,'label',String(s.data?.label??'BOOKS / MEDIA'));break
 }
 case 'alpha_library_terminal':
  legs(w,d,.74);B(0,0,.73,w,d,.045,'laminate','#b3ad87',true);screen(.28,.10,.775);B(w-.30,.42,.777,.065,.10,.035,'plastic','#313b37',false,'round')
  B(.06,.06,.06,.22,.48,.47,'plastic','#4c5651',true);B(.82,.26,.779,.25,.025,.02,'plastic','#292e2c');for(const xx of [.82,1.04])B(xx,.23,.79,.065,.1,.08,'fabric','#313b38',false,'round');paper(1.10,.04,.777);break
 case 'alpha_library_counter':
  B(0,0,.035,w,d,.92,'wood','#b29665',true);B(-.01,-.01,.955,w+.02,d+.02,.05,'laminate','#c9bd94',true);B(.05,d-.018,.17,w-.1,.035,.49,'paint','#e1deca');B(.15,d+.02,.69,w-.3,.008,.17,'paint','#dbdec7',false,undefined,'label','EPIPHANY / LIBRARY');screen(.30,.06,1.005);paper(w-.6,.17,1.006)
  for(let i=0;i<4;i++)B(w-1.2,.20,1.005+i*.023,.35,.24,.019,'fabric',['#6b785a','#cbbea0'][i%2]);break
 case 'alpha_reading_chair':
  for(const x of [.09,w-.14])for(const y of [.09,d-.14])B(x,y,0,.05,.05,.2,'wood','#5e4d38',true)
  B(.04,.07,.16,w-.08,d-.10,.30,'office_fabric',color,true,'round');B(.08,.06,.43,w-.16,.15,.44,'office_fabric',color,true,'round');for(const x of [.015,w-.15])B(x,.1,.32,.14,d-.16,.31,'office_fabric',color,true,'round');break
 case 'alpha_library_soffit':
  B(0,0,0,w,d,H,'paint','#a83e26');for(let y=.8;y<d;y+=2.6){B(w/2-.12,y,-.018,.24,.24,.025,'steel','#b5b7a8',false,'rod');B(w/2-.085,y+.035,-.027,.17,.17,.015,'light','#fff1c9',false,'rod')}break
 case 'alpha_home_wardrobe':
  B(0,0,.06,w,d,H-.16,'wood',color,true);for(let i=0;i<3;i++){B(.02+i*w/3,d-.01,.13,w/3-.03,.024,H-.27,'wood',color);B(.12+i*w/3,d+.018,.96,.025,.027,.13,'metal','#a9a790')}
  B(.07,.07,H-.09,w*.42,d*.77,.08,'fabric','#868475');B(w*.6,.06,H-.08,w*.3,d*.75,.07,'cardboard','#b29e76');break
 case 'alpha_home_kitchen':{
  const fridge=.68;B(w-fridge,0,.025,fridge,d,H-.04,'paint','#dadbca',true);for(const zz of [.3,1.24])B(w-.095,d+.014,zz,.023,.025,.24,'metal','#a8afa4');B(w-fridge,d+.002,1.16,fridge,.004,.009,'paint','#a7ad9c')
  B(0,0,.1,w-fridge-.04,d,.73,'wood',color,true);B(0,0,.83,w-fridge-.02,d,.055,'laminate','#cbc7ad',true)
  for(let x=.05;x<w-fridge-.1;x+=.51){B(x,d+.003,.13,.46,.012,.64,'wood',color);B(x+.29,d+.02,.68,.12,.026,.02,'metal','#adae9a')}
  B(.15,.1,.887,.55,.42,.018,'steel','#8e9b95');B(.20,.15,.89,.45,.32,.012,'paint','#576b65');B(.51,.065,.89,.023,.025,.27,'metal','#adbeb5',false,'rod');B(.51,.065,1.14,.023,.16,.025,'metal','#adbeb5')
  B(1.05,.09,.888,.56,.45,.018,'paint','#343f3a');for(const x of [1.11,1.39])for(const yy of [.15,.39])B(x,yy,.91,.15,.15,.016,'metal','#66766b',false,'rod')
  B(.04,.01,1.5,w-fridge-.12,.30,.62,'wood',color,true);for(let x=.10;x<w-fridge-.2;x+=.53)B(x,.314,1.57,.025,.02,.12,'metal','#b9b9a0')
  B(1.9,.16,.887,.17,.20,.26,'metal','#a7afa2',false,'round');mug(2.2,.24,.887);paper(2.4,.16,.887);break
 }
 case 'alpha_home_table':{
  B(.24,.46,.72,w-.48,d-.92,.047,'wood','#a78755',true);for(const x of [.3,w-.34])for(const yy of [.51,d-.55])B(x,yy,0,.04,.04,.72,'wood','#82613f',true)
  for(const x of [.38,w- .86])for(const yy of [.05,d-.47]){B(x,yy,.41,.48,.42,.05,'wood','#876c4b',true);B(x,yy<.2?yy:yy+.37,.46,.48,.045,.40,'wood','#876c4b',true);for(const xx of [x+.03,x+.41])B(xx,yy+.04,0,.035,.31,.42,'wood','#6d5436')}
  mug(.55,.63,.767);mug(w-.72,d-.79,.767);paper(w/2-.1,.55,.767);break
 }
 case 'alpha_laundry':
  for(let i=0;i<2;i++){B(i*.72,0,.035,.68,d,.83,'paint','#d6dace',true);B(i*.72+.12,d+.002,.18,.44,.034,.44,'metal','#a9b4af',false,'disc');B(i*.72+.18,d+.023,.24,.32,.022,.32,'glass','#788d8c',false,'disc');B(i*.72+.05,d+.008,.75,.4,.012,.055,'paint','#7d8b83');B(i*.72+.53,d+.014,.74,.08,.02,.08,'plastic','#a5b0a3',false,'disc')}
  B(1.48,0,.05,w-1.48,d,.79,'wood','#a28b68',true);B(0,0,.876,w,d,.05,'laminate','#c5c8b2',true);for(let i=0;i<3;i++)B(1.65,.14,.927+i*.035,.53,.4,.032,'fabric',i%2?'#9ba8a3':'#ddd7c1',false,'round');B(.15,.15,.926,.12,.12,.16,'plastic','#638977',false,'round');break
 case 'alpha_memorial':
  B(0,0,.035,w,d,.85,'wood','#806c4e',true);B(.05,.02,.9,w-.1,.085,.95,'wood','#6f5a3e');B(.12,.112,1.1,w-.24,.012,.61,'paint','#d0c5a3',false,undefined,'memorial')
  for(let i=0;i<7;i++)B(.12+i*.12,d-.25,.88,.08,.19,.18+(i%3)*.018,'fabric',['#8f9b8b','#ac9772','#596a61'][i%3]);B(w-.28,.12,.89,.13,.13,.19,'paint','#bfb494',false,'rod');break
 case 'alpha_home_frame':
  B(0,0,0,w,d,H,'wood','#554934');B(.035,d+.001,.035,w-.07,.008,H-.07,'paint','#d1d4bb',false,undefined,'residential_art');break
 case 'alpha_build_supplies':
  for(let row=0;row<7;row++)for(let col=0;col<3;col++)B(.03,col*.19,.04+row*.045,w*.8,.16,.036,'wood',row%2?'#c0a779':'#b39467',true)
  for(let i=0;i<3;i++)B(w-.42,.10,.02+i*.16,.36,.49,.14,'fabric','#b9b29b',true,'round');B(.1,.63,.03,.28,.20,.33,'plastic','#a6b0a5',true,'rod');break
 case 'alpha_build_barrier':
  for(const x of [.1,w-.16]){B(x,0,0,.06,d,.04,'metal','#656b5b',true);B(x,.12,.03,.035,.035,H-.1,'metal','#7f8570',true)}
  for(const h of [.53,.92]){B(.02,.10,h,w-.04,.07,.14,'paint','#cfb85f',true);for(let x=.1;x<w-.1;x+=.27)B(x,.174,h,.10,.004,.14,'paint','#424938')};break
 case 'alpha_aquila_column':
  if(skin==='library'){B(0,0,0,w,d,H,'paint','#d7d5be',true);break}
  B(.08,.08,0,w-.16,d-.16,H,'aquila_concrete','#aeb2a8',true);B(0,0,0,w,d,.15,'aquila_concrete','#929b92',true);B(0,0,H-.25,w,d,.25,'aquila_concrete','#adb0a5');break
 }
 return a
}
