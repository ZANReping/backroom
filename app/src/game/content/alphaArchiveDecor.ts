import type { Structure } from '../core/types'
import type { AlphaPart, AlphaPanel, AlphaSurface } from './alphaDecor'

export const ARCHIVE_NAMES={
 alpha_archive_cubicle:'档案员布面隔断与 L 形工位',alpha_archive_chair:'档案员软垫转椅',
 alpha_tech_bench:'技术支援多屏开发工作台',alpha_archive_bank:'编号纸质档案抽屉柜',
 alpha_archive_reader:'档案检索与阅览台',alpha_archive_trolley:'档案归还推车',alpha_archive_printer:'档案室激光打印机',
} as const
export const ARCHIVE_DIMENSIONS:Record<keyof typeof ARCHIVE_NAMES,[number,number,number,boolean]>={
 alpha_archive_cubicle:[3,2.5,1.8,true],alpha_archive_chair:[.65,.68,1.05,true],
 alpha_tech_bench:[3.6,2.2,1.4,true],alpha_archive_bank:[1.65,.62,2.4,true],
 alpha_archive_reader:[1.8,.8,1.05,true],alpha_archive_trolley:[.8,.5,1.1,true],alpha_archive_printer:[.56,.56,.35,false],
}
// One atlas covers A–D, five bottom-up rows and 24 positions per aisle.
export function archiveCode(aisle:string,row:number,column:number){return `${aisle}${row}${String(column).padStart(2,'0')}`}
export function archiveCodeIndex(code:string){
 const m=/^([A-D])([1-5])(0[1-9]|1[0-9]|2[0-4])$/.exec(code)
 if(!m)throw new Error('Invalid Alpha archive location: '+code)
 return ((m[1].charCodeAt(0)-65)*5+Number(m[2])-1)*24+Number(m[3])-1
}
export function archiveParts(s:Structure):AlphaPart[]{
 const a:AlphaPart[]=[],z=Number(s.data?.z??0),w=s.w,d=s.h
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',color='#d7d6ca',solid=false,shape?:AlphaPart['shape'],panel?:AlphaPanel,text?:string)=>{
  if(ww>0&&dd>0&&h>0)a.push({x,y,z:z+zz,w:ww,d:dd,h,surface,color,solid,shape,panel,text})
 }
 const paper=(x:number,y:number,zz:number,ww=.22,dd=.29)=>{B(x,y,zz,ww,dd,.014,'paint','#e4e1d2');for(let i=0;i<3;i++)B(x+.018,y+.035+i*.022,zz+.014,ww*.65,.002,.001,'paint','#909790')}
 const cable=(x:number,y:number,zz:number,len:number,alongX=true)=>{
  B(x,y,zz,alongX?len:.008,alongX?.008:len,.009,'plastic','#2b302e')
  const endX=x+(alongX?len-.008:0),endY=y+(alongX?0:len-.008)
  if(zz>.06)B(endX,endY,.015,.008,.008,zz-.015,'plastic','#333834')
  else B(endX,endY,zz,alongX?.008:.13,alongX?.13:.008,.009,'plastic','#333834')
 }
 const keyboard=(x:number,y:number,zz:number)=>{
  B(x,y,zz,.43,.15,.025,'plastic','#c1c3b6');for(let row=0;row<4;row++)for(let col=0;col<13;col++)B(x+.014+col*.031,y+.011+row*.031,zz+.025,.025,.022,.009,'plastic',row===3&&col<8?'#b1b5a9':'#dcdbce')
 }
 const phone=(x:number,y:number,zz:number)=>{
  B(x,y,zz,.22,.24,.055,'plastic','#252c2a',false,'round');B(x+.013,y+.01,zz+.06,.054,.215,.042,'plastic','#181e1d',false,'round')
  B(x+.095,y+.02,zz+.057,.096,.055,.004,'paint','#8caa93');for(let i=0;i<12;i++)B(x+.091+(i%3)*.033,y+.093+Math.floor(i/3)*.026,zz+.057,.022,.016,.008,'plastic','#b0b6aa')
  for(let i=0;i<12;i++)B(x-.022+(i%2)*.013,y+.07+i*.012,zz,.023,.01,.008,'plastic','#252b27',false,'round')
 }
 const tower=(x:number,y:number,zz=0,color='#d2d3ca')=>{
  B(x,y,zz,.2,.42,.5,'paint',color,true,'round');B(x+.015,y+.421,zz+.27,.17,.005,.16,'paint','#454c49')
  for(let i=0;i<5;i++)B(x+.025,y+.43,zz+.30+i*.023,.145,.003,.006,'paint','#1e2727')
  B(x+.155,y+.426,zz+.2,.01,.005,.014,'light','#7bcdac');cable(x+.08,y+.1,zz+.03,.55)
 }
 const printer=(x:number,y:number,zz:number)=>{
  B(x,y,zz,.56,.43,.22,'plastic','#d3d5d0',false,'round');B(x+.055,y+.045,zz+.22,.44,.28,.11,'plastic','#e7e8df',false,'round')
  B(x+.09,y+.095,zz+.327,.36,.125,.013,'plastic','#4d5757');B(x+.12,y+.115,zz+.34,.30,.23,.008,'paint','#e6e6dc')
  B(x+.065,y+.40,zz+.09,.43,.023,.07,'plastic','#3b4846');B(x+.05,y+.32,zz+.045,.46,.24,.018,'plastic','#a4ada9');paper(x+.105,y+.345,zz+.064,.35,.20)
  B(x+.47,y+.28,zz+.223,.022,.022,.009,'light','#8bae87')
 }
 const monitor=(x:number,y:number,zz:number,crt=false,off=false)=>{
  B(x+.12,y+.12,zz,.29,.21,.025,'plastic','#bcc0b5',false,'round');B(x+.245,y+.12,zz+.02,.045,.08,.12,'paint','#b4b7ac')
  if(crt)B(x+.02,y-.25,zz+.10,.49,.34,.39,'plastic','#aeb3a6',false,'round')
  B(x,y+.09,zz+.11,.54,.065,.40,'plastic',off&&!crt?'#252d2d':'#d1d5cb')
  B(x+.035,y+.158,zz+.148,.47,.008,.319,'paint',off?'#101a1f':'#dee5df',false,undefined,off?undefined:'archive_screen',crt?'catalogue':'software')
  B(x+.48,y+.159,zz+.12,.012,.008,.01,'light','#83bb95');cable(x+.27,y,zz-.15,.21,false)
 }
 const desk=(x:number,y:number,ww:number,dd:number,color:string)=>{
  B(x,y,.735,ww,dd,.045,'laminate',color,true);B(x,y+dd-.013,.72,ww,.016,.06,'plastic','#5b615b')
  for(const xx of [x+.05,x+ww-.07]){B(xx,y+.05,.04,.028,dd-.10,.035,'metal','#8e9690');B(xx,y+.15,.075,.028,.035,.65,'metal','#929994')}
 }
 switch(s.kind){
 case 'alpha_archive_cubicle':{
  B(0,0,.05,w,.075,1.73,'office_fabric','#bbbbaa',true);for(const x of [0,w-.075])B(x,0,.05,.075,d,1.73,'office_fabric','#b4b6a6',true)
  for(const x of [0,w-.065])B(x,0,0,.065,.085,1.8,'metal','#c7ccc4');B(0,0,1.76,w,.09,.035,'metal','#c3c8c0')
  for(const x of [0,w-.075])B(x,0,1.76,.075,d,.035,'metal','#bec5bd')
  desk(.10,.12,w-.2,.70,'#b4b7a4');desk(w-.73,.82,.63,1.46,'#b4b7a4')
  B(.12,.08,1.23,w-.24,.32,.51,'paint','#b4bbb0');for(let i=0;i<2;i++){
   B(.13+i*(w-.25)/2,.407,1.24,(w-.28)/2,.035,.48,'office_fabric','#354760');B(.68+i*(w-.25)/2,.443,1.29,.038,.015,.038,'plastic','#192b38',false,'disc')
  }
  monitor(.62,.30,.782,true,true);keyboard(.62,.64,.782);B(1.12,.64,.784,.083,.115,.036,'plastic','#777687',false,'round')
  printer(w-1.05,.25,.782);phone(.16,.38,.785);tower(w-.67,1.65)
  B(w-.63,1.28,.785,.41,.32,.018,'fabric','#514776');paper(w-.60,1.30,.805,.36,.28)
  B(1.48,.49,.78,.09,.09,.13,'plastic','#252f2b');for(let i=0;i<5;i++)B(1.493+i*.013,.52,.84,.009,.009,.15,'plastic',i%2?'#326488':'#d8cdb3')
  cable(.74,.48,.22,1.54);cable(1.26,.47,.05,.66,false)
  B(w-.63,.94,0,.31,.30,.36,'plastic','#194383',false,'round');B(w-.603,.969,.344,.256,.244,.023,'paint','#152b47')
  B(.18,.085,1.08,.24,.007,.32,'paint','#e2dfd2',false,undefined,'archive_screen','notice');break
 }
 case 'alpha_archive_chair':{
  const c=s.data?.skin==='tech'?'#5d6660':'#638b87'
  B(.065,.07,.44,w-.13,d-.14,.10,'office_fabric',c,true,'round');B(.07,d-.13,.51,w-.14,.105,.51,'office_fabric',c,true,'round')
  for(const x of [.015,w-.055]){B(x,.14,.50,.027,.03,.21,'metal','#454e4b');B(x-.005,.12,.71,.065,.37,.045,'plastic','#333c39',false,'round')}
  B(w/2-.028,d/2-.028,.10,.056,.056,.35,'metal','#8c9590',false,'rod')
  B(.015,d/2-.024,.09,w-.03,.048,.035,'plastic','#3d4843');B(w/2-.025,.025,.09,.05,d-.05,.035,'plastic','#3d4843')
  for(const [x,y] of [[.035,d/2],[w-.08,d/2],[w/2,.04],[w/2,d-.085]])B(x,y,.028,.08,.055,.07,'plastic','#202b29',false,'globe');break
 }
 case 'alpha_tech_bench':{
  desk(0,0,w,.78,'#c9ba80');desk(w-.72,.78,.72,d-.78,'#c9ba80');desk(0,.78,.65,.67,'#c9ba80')
  monitor(.24,.23,.783,false,true);monitor(1.61,.23,.783);monitor(2.34,.23,.783);keyboard(1.67,.61,.786);keyboard(.27,.62,.786)
  B(2.25,.63,.79,.07,.12,.04,'plastic','#3d4746',false,'round')
  tower(.15,.17,0,'#747e76');tower(w-1.10,.15,0,'#a2aaa0');tower(w-.59,1.16,0,'#535e5a')
  B(1.11,.13,.784,.37,.42,.22,'plastic','#2d3436',true,'round');B(1.14,.55,.82,.26,.007,.03,'paint','#171f26');B(1.18,.56,.82,.012,.006,.012,'light','#547cff')
  for(let i=0;i<3;i++){B(.06,.92+i*.12,.783,.22,.10,.027,'paint','#dbdccc');B(.11,1.005+i*.12,.79,.055,.012,.014,'paint','#68756b')}
  phone(w-.49,1.45,.788);paper(w-.59,.92,.782,.40,.28);cable(w-.43,1.14,.814,.65,false)
  for(let i=0;i<7;i++)cable(.36+i*.39,.1,.014,.36+i*.15,false)
  B(1.05,.67,.788,.075,.075,.11,'paint','#e9e0cb',false,'rod');B(1.049,.67,.899,.078,.078,.018,'plastic','#e7e2d4',false,'rod')
  B(w-.43,1.12,.80,.11,.025,.09,'plastic','#343e3b');B(w-.48,1.11,.8,.045,.065,.065,'plastic','#202b28',false,'round');B(w-.31,1.11,.8,.045,.065,.065,'plastic','#202b28',false,'round');break
 }
 case 'alpha_archive_bank':{
  const aisle=String(s.data?.aisle??'A'),start=Number(s.data?.start??1),columns=4,rows=5,cw=w/columns,rh=.43
  B(.025,.025,.06,w-.05,d-.05,2.20,'cabinet_metal','#6d6e59',true)
  for(const x of [0,w-.038])for(const y of [0,d-.038]){
   B(x,y,0,.038,.038,2.39,'steel','#b0b8b2',true);for(let zz=.13;zz<2.3;zz+=.10)B(x+.008,y+.039,zz,.013,.003,.036,'paint','#48554f')
  }
  for(let row=0;row<rows;row++){
   const zz=.10+row*rh
   B(0,0,zz-.03,w,d,.025,'steel','#a0a99f')
   for(let col=0;col<columns;col++){
    const xx=.04+col*cw,code=archiveCode(aisle,row+1,start+col)
    B(xx,d-.045,zz,cw-.064,.052,rh-.022,'cabinet_metal',(col+row)%4===0?'#7d7c65':'#70715b')
    B(xx+.075,d+.008,zz+.22,.22,.012,.116,'steel','#b7bcb4')
    B(xx+.085,d+.021,zz+.233,.20,.004,.087,'paint','#e4e0c9',false,undefined,'archive_code',code)
    for(const dx of [.08,.27])B(xx+dx,d+.012,zz+.107,.025,.045,.034,'steel','#b4bbb7')
    B(xx+.073,d+.05,zz+.108,.224,.025,.025,'steel','#c3cac5',false,'round')
    B(xx+.014,d+.011,zz+.331,.036,.006,.036,'paint','#79a258',false,'disc')
   }
  }
  B(0,0,2.26,w,d,.035,'steel','#abb3ac')
  for(let i=0;i<2;i++){B(.06+i*w/2,.05,2.30,w/2-.12,.47,.09,'laminate','#a59871');B(.15+i*w/2,.524,2.319,.30,.004,.039,'paint','#ddd7bf')}
  break
 }
 case 'alpha_archive_reader':
  desk(0,0,w,d,'#bfc1b0');paper(.18,.17,.784,.31,.38);B(.77,.12,.781,.41,.31,.045,'fabric','#536678');paper(.80,.14,.828,.35,.26)
  for(let i=0;i<3;i++){B(w-.47,.11,.79+i*.076,.35,.40,.014,'metal','#748378');B(w-.47,.11,.80+i*.076,.014,.40,.06,'metal','#748378');paper(w-.435,.13,.81+i*.076,.28,.31)}break
 case 'alpha_archive_trolley':
  for(const zz of [.14,.55,.91]){B(.035,.025,zz,w-.07,d-.05,.027,'metal','#7c8982',true);B(.035,.025,zz,w-.07,.02,.065,'metal','#7c8982')}
  for(const x of [.03,w-.055])for(const y of [.04,d-.06]){B(x,y,.1,.025,.025,.95,'metal','#929d94');B(x-.024,y-.012,.02,.07,.06,.085,'plastic','#333f39',false,'globe')}
  for(let i=0;i<6;i++)B(.10+i*.095,.07,.58,.07,.34,.26,'fabric',['#7c6f4e','#51696b','#909482'][i%3]);paper(.13,.09,.94,.47,.32);break
 case 'alpha_archive_printer':printer(0,0,0);break
 }
 return a
}
