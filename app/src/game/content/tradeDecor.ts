import type {Structure} from '../core/types'
export const TRADE_NAMES={
 trade_floor:'贸易地坪模块',trade_wall:'贸易墙段',trade_glass:'贸易玻璃隔断',trade_column:'贸易包柱',trade_beam:'贸易主梁',trade_arch:'商业街拱架',trade_ceiling:'贸易吊顶',trade_roof:'金属屋面',trade_duct:'设备管线段',trade_frame:'卷帘储藏室门框',
 trade_counter:'交易柜台',trade_terminal:'办理终端',trade_queue:'排队栏杆组',trade_lightbox:'业务灯箱',trade_prices:'报价板',trade_shop:'商铺门面',trade_showcase:'玻璃商品柜',trade_goods:'商品壁架',trade_sign:'悬挂招牌',trade_stall:'外摆货摊',
 trade_scale:'物流台秤',trade_seal:'封签验货台',trade_pack:'打包台',trade_pallet:'托盘货组',trade_cart:'货运手推车',trade_rack:'分类仓储架',trade_number:'编号门牌',trade_anomaly:'异常货物箱',trade_security:'警备检查台',trade_car:'浅蓝色固定汽车展品',
} as const
export type TradeKind=keyof typeof TRADE_NAMES
export type TradeSurface='concrete'|'metal'|'wood'|'glass'|'paint'|'fabric'|'tile'
export interface TradePart{x:number;y:number;z:number;w:number;d:number;h:number;surface:TradeSurface;color:string;solid?:boolean;shape?:'arch'|'wheel';text?:string}
export interface TradeDef{id:TradeKind;name:string;w:number;d:number;height:number;solid:boolean;interactive:boolean;parameters:readonly string[]}
const sizes:Partial<Record<TradeKind,[number,number,number]>>={trade_floor:[4,4,.16],trade_wall:[4,.2,3.6],trade_glass:[4,.12,3],trade_column:[.6,.6,4.8],trade_beam:[6,.4,.4],trade_arch:[6,.35,5.2],trade_ceiling:[4,4,.2],trade_roof:[4,4,.2],trade_duct:[6,.45,.35],trade_frame:[3.2,.3,2.8],trade_counter:[4,.9,1.1],trade_queue:[3,.1,1],trade_shop:[6,.3,3.6],trade_sign:[1.1,.1,2.4],trade_lightbox:[5,.15,.65],trade_prices:[2,.15,1.3],trade_number:[1,.08,.35],trade_rack:[5,.9,2.3],trade_car:[4.5,1.8,1.35]}
export const TRADE_DEFS:TradeDef[]=Object.entries(TRADE_NAMES).map(([id,name])=>{const k=id as TradeKind,[w,d,height]=sizes[k]??[2,1,1.2];return {id:k,name,w,d,height,solid:!['trade_floor','trade_beam','trade_ceiling','trade_roof','trade_duct','trade_lightbox','trade_prices','trade_sign','trade_number'].includes(k),interactive:['trade_terminal','trade_counter','trade_scale','trade_seal','trade_pack','trade_anomaly','trade_security','trade_prices','trade_car'].includes(k),parameters:['width','depth','height','z','deg','color','label','service','cargoId']}})
export function isTradeKind(k:string):k is TradeKind{return k in TRADE_NAMES}
export function tradeParts(s:Structure):TradePart[]{
 const def=TRADE_DEFS.find(d=>d.id===s.kind)!,a:TradePart[]=[],w=s.w||def.w,d=s.h||def.d,H=Number(s.data?.height??def.height),z=Number(s.data?.z??0),c=String(s.data?.color??'#aeb4ad')
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:TradeSurface='metal',color=c,solid=false,shape?:TradePart['shape'],text?:string)=>a.push({x,y,z:zz+z,w:ww,d:dd,h,surface,color,solid,shape,text})
 const label=()=>String(s.data?.label??def.name)
 const rack=()=>{for(const x of [0,w-.06])B(x,0,0,.06,d,H,'metal','#626f70',true);for(let j=0;j<5;j++){B(0,0,j*H/5,w,d,.06,'metal','#7f8882',true);for(let x=.12;x<w-.4;x+=.65)B(x,.08,j*H/5+.07,.48,Math.max(.2,d-.13),H/5-.1,'wood',['#ad9574','#697e77','#b5b395'][Math.floor(x*4)%3])}}
 switch(s.kind){
 case 'trade_floor':B(0,0,-H,w,d,H,'tile','#b9c4be');break
 case 'trade_wall':B(0,0,0,w,d,H,'concrete',c,true);break
 case 'trade_glass':B(0,0,0,w,d,.8,'metal','#bcc5bf',true);B(0,0,.8,w,d,H-.8,'glass','#b3d1c6',true);break
 case 'trade_column':B(0,0,0,w,d,H,'concrete',c,true);B(-.08,-.08,0,w+.16,d+.16,.35,'metal','#5a6561');break
 case 'trade_beam':case 'trade_ceiling':case 'trade_roof':case 'trade_duct':B(0,0,0,w,d,H,s.kind==='trade_beam'?'concrete':'metal',s.kind==='trade_ceiling'?'#343e40':c);if(s.kind==='trade_roof')for(let x=0;x<w;x+=.25)B(x,0,H,.05,d,.04);break
 case 'trade_arch':B(0,0,0,.2,d,H-1.5,'concrete','#b6af96',true);B(w-.2,0,0,.2,d,H-1.5,'concrete','#b6af96',true);B(0,0,H-1.5,w,d,1.5,'concrete','#b6af96',false,'arch');break
 case 'trade_frame':case 'trade_shop':B(0,0,0,.15,d,H,'metal','#828982',true);B(w-.15,0,0,.15,d,H,'metal','#828982',true);B(0,0,H-.25,w,d,.25,'metal','#828982');break
 case 'trade_sign':case 'trade_number':case 'trade_lightbox':case 'trade_prices':B(0,0,0,w,d,H,'paint',c,false,undefined,label());break
 case 'trade_queue':for(const x of [0,w-.08])B(x,0,0,.08,.08,H,'metal','#a4acac',true);B(0,0,H-.16,w,.05,.1,'fabric','#374e47',true);break
 case 'trade_rack':case 'trade_goods':rack();break
 case 'trade_car':
  B(.35,.1,.35,w-.7,d-.2,.48,'paint','#8dbad2',true);B(1.5,.2,.83,1.7,d-.4,.43,'glass','#9ac1cd');B(.1,.08,.53,.4,d-.16,.1,'metal','#d1d6d6');B(w-.4,.08,.45,.25,d-.16,.1,'metal','#d1d6d6')
  for(const x of [.8,w-.8])for(const y of [0,d-.2])B(x-.32,y,.12,.64,.2,.64,'paint','#24292b',true,'wheel');break
 case 'trade_anomaly':B(0,0,0,w,d,H,'wood','#b7a078',true);B(w*.45,0,0,.12,d+.01,H+.01,'metal','#697d6c');B(.15,d+.01,H*.55,w-.3,.02,.3,'paint','#e5dfbd',false,undefined,label());break
 case 'trade_pallet':B(0,0,0,w,d,.15,'wood','#9a825e',true);for(let x=.05;x<w-.35;x+=.6)B(x,.05,.15,.5,d-.1,H-.15,'wood','#b09a7c',true);break
 case 'trade_cart':B(0,0,.2,w,d,.15,'metal','#818b86',true);B(0,0,.3,.1,d,.8,'metal','#788a83',true);for(const x of [.1,w-.3])for(const y of [.1,d-.3])B(x,y,0,.2,.2,.2,'paint','#343d39');break
 case 'trade_showcase':B(0,0,0,w,d,.6,'wood','#a18c70',true);B(0,0,.6,w,d,.65,'glass','#afcec3',true);for(let x=.1;x<w-.2;x+=.4)B(x,.1,.63,.25,d-.2,.3,'paint','#ccbd91');break
 default:
  B(0,0,0,w,d,.95,'wood',s.kind==='trade_security'?'#52695b':'#9c927d',true);B(-.03,-.03,.95,w+.06,d+.06,.08,'metal','#c3c9bd')
  if(s.kind==='trade_terminal'||s.kind==='trade_security')B(.25,.15,1.03,.7,.15,.5,'paint','#688e89',false,undefined,label())
  if(s.kind==='trade_scale'){B(.2,.15,1.03,w-.4,d-.3,.08,'metal','#a1b1a8');B(w-.3,0,1.03,.08,.08,.5);B(w-.65,0,1.45,.6,.1,.3,'paint','#5b7d69')}
  if(s.kind==='trade_pack')B(.15,.15,1.03,w*.5,d*.65,.5,'wood','#b7a482')
  if(s.kind==='trade_seal')B(.2,.1,1.04,w-.4,d-.2,.025,'paint','#e0dac1',false,undefined,label())
  if(s.kind==='trade_stall')for(let x=.1;x<w-.3;x+=.5)B(x,.1,1.03,.3,d-.2,.3,'paint','#ba9971')
 }
 return a
}

