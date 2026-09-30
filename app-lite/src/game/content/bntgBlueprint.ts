import type {Structure} from '../core/types'
import {TRADE_DEFS,type TradeKind} from './tradeDecor'
import {room,type SettlementBlueprint} from './settlementTypes'
const decorations:Structure[]=[]
const put=(kind:TradeKind,x:number,y:number,w?:number,h?:number,data:Structure['data']={})=>{
 const d=TRADE_DEFS.find(d=>d.id===kind)!
 const s:Structure={kind,x,y,w:w??d.w,h:h??d.d,solid:d.solid,data:{height:d.height,...data}};decorations.push(s);return s
}
const b:SettlementBlueprint={id:'bntg',level:102,size:80,faction:'bntg',name:'商人之家',rooms:[],shells:[{x:6,y:8,w:68,h:64,height:3.6,roof:'industrial'}],
 partitions:[],doors:[],services:[],decorations,corridors:[{x:37,y:2,w:6,h:8},{x:2,y:53,w:6,h:6},{x:72,y:37,w:6,h:6}],exits:[{x:40,y:2},{x:77,y:40},{x:2,y:56}],spawn:{x:40,y:12},circulation:[{x:37,y:8,w:6,h:20},{x:14,y:24,w:6,h:36},{x:60,y:24,w:6,h:36},{x:6,y:56,w:68,h:4},{x:70,y:40,w:4,h:28}],focus:{x:40,y:19,targets:['market','vault_entry','logistics']}}
const zone=(id:string,name:string,x:number,y:number,w:number,h:number,style:Parameters<typeof room>[6],height:number,enclosed=false)=>{b.rooms.push(room(id,name,x,y,w,h,style,'n',{height,enclosed,furniture:[]}));b.shells.push({x,y,w,h,height,roof:'industrial'})}
zone('market','交易大厅 · 接待与报价',8,10,64,14,'market',3.6)
zone('west_market','西商业街 · 食品、医疗、工具、电气',8,26,18,30,'market',5.2)
zone('east_market','东商业街 · 装备、日用、维修、运输',54,26,18,30,'market',5.2)
zone('vault_entry','交易保险库 · 登记前室',28,24,24,4,'intake',3.2)
zone('vault','编号保险库长廊',28,28,24,28,'vault',2.8,true)
zone('logistics','南部物流 · 收货、封签与打包',48,60,24,10,'workshop',3.6)
zone('transport','业务办公室与项目审查',8,60,16,10,'office',2.8)
zone('canteen','职员共享食堂与休息',26,60,12,10,'dining',2.8)
zone('beds_0','职员宿舍 A',39,60,7,4,'bedroom',2.6,true)
zone('beds_1','职员宿舍 B',39,66,7,4,'bedroom',2.6,true)
function service(id:string,zoneId:string,x:number,y:number,services:string,npc?:string,access=0,kind:TradeKind='trade_counter'){
 const r=b.rooms.find(r=>r.id===zoneId)!;r.service??=services.split('/')[0];r.npc??=npc
 b.services.push({id,zone:zoneId,x,y,label:r.name,services:services.split('/'),npc,access})
 return put(kind,x-.6,y-.5,2,1,{label:r.name,services:services.split('/'),service:services.split('/')[0],room:zoneId,faction:'bntg',access,npc:npc??'',facility:true})
}
// All architecture is registered. Outer approach walls follow the actual walkable silhouette.
const inside=(x:number,y:number)=>b.shells.slice(0,1).concat(b.corridors.map(c=>({...c,height:3.6,roof:'industrial' as const}))).some(r=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h)
const top=(x:number,y:number)=>{let h=3.6;for(const r of b.shells)if(x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h)h=r.height;return h}
for(let y=2;y<78;y++)for(let x=2;x<78;x++)if(inside(x+.5,y+.5)){
 let height=3.6;for(const s of b.shells)if(x+.5>=s.x&&x+.5<s.x+s.w&&y+.5>=s.y&&y+.5<s.y+s.h)height=s.height
 put('trade_floor',x,y,1,1)
 put('trade_ceiling',x,y,1,1,{z:height,height:.18})
}
for(let y=2;y<78;y++)for(let x=2;x<78;x++)if(inside(x+.5,y+.5)){
 let height=3.6;for(const s of b.shells)if(x+.5>=s.x&&x+.5<s.x+s.w&&y+.5>=s.y&&y+.5<s.y+s.h)height=s.height
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(!inside(x+.5+dx,y+.5+dy))put('trade_wall',x+(dx===1?.85:0),y+(dy===1?.85:0),dx?.15:1,dy?.15:1,{height})
}
// Close every unequal-height edge, including east/west market flanks and lower roofs.
for(let y=8;y<72;y++)for(let x=6;x<74;x++)for(const [dx,dy] of [[1,0],[0,1]]){
 if(!inside(x+.5+dx,y+.5+dy))continue
 const a=top(x+.5,y+.5),c=top(x+.5+dx,y+.5+dy)
 if(a!==c)put('trade_wall',x+(dx?.94:0),y+(dy?.94:0),dx?.12:1,dy?.12:1,{z:Math.min(a,c),height:Math.abs(a-c)})
}
for(const x of [10,22,54,66]){
 put('trade_counter',x,14,8,1,{color:'#858d87'})
 put('trade_lightbox',x,14,8,.12,{z:2.6,height:.5,label:x<40?'登记 · 报价 · 运输':'寄存 · 合同 · 交接'})
 for(let i=0;i<3;i++)put('trade_terminal',x+i*2.5,14,.8,.65,{height:1.4})
 put('trade_queue',x,17,6,.12)
}
service('market','market',12,15,'market/seal','vesper')
service('employment','market',24,15,'career/contract/report',undefined,0,'trade_terminal')
service('warehouse','market',58,15,'warehouse/inventory','dorian')
put('trade_prices',31,11,4,.12,{z:1.2,label:'B.N.T.G. / 今日报价',height:1.4,color:'#496c58'})
const categories=['食品','医疗','工具','电气','装备','日用','维修','运输']
for(let street=0;street<2;street++){
 const x=street?54:8,lane=x+6
 for(let row=0;row<4;row++){
  const y=26+row*7.5,name=categories[street*4+row]
  put('trade_arch',lane,y,6,.3,{height:5.2})
  for(let side=0;side<2;side++){
   const sx=x+side*12,label=(street*8+row*2+side+1).toString().padStart(2,'0')+' / '+name
   put('trade_shop',sx,y,6,.25,{height:3.6})
   put('trade_goods',sx+.5,y+.6,5,.8,{height:2.5})
   put('trade_showcase',sx+.5,y+3,3,.8)
   put('trade_stall',sx+4,y+3,1.2,1.2)
   put('trade_sign',side?sx:sx+4.7,y+1.5,1,.1,{z:2.1,height:2.1,label,color:['#a17446','#496f69','#98563e','#697342'][row]})
   put('trade_lightbox',sx+.3,y,5.4,.1,{z:3,height:.45,label,color:'#d4bc79'})
  }
 }
}
// Eight real storage cells flank a straight 4 m central lane.
const labels=['食品','医疗','工具','电气','周转','高价值','异常盘点','杂物收藏']
for(let row=0;row<4;row++)for(let side=0;side<2;side++){
 const i=row*2+side,x=side?42:28,y=28+row*7,w=10,access=i===5?3:2
 zone('storage_'+i,labels[i]+' / V0'+(i+1),x,y,w,7,'vault',2.8,true)
 put('trade_wall',side?51.8:28,y,.2,7,{height:2.8})
 put('trade_wall',x,y,10,.18,{height:2.8})
 if(row===3)put('trade_wall',x,y+6.8,10,.2,{height:2.8})
 const wallX=side?42:37.8,doorY=y+2
 put('trade_wall',wallX,y,.2,2,{height:2.8});put('trade_wall',wallX,y+5,.2,2,{height:2.8})
 put('trade_frame',wallX-1.4,doorY+1.35,3.2,.3,{deg:90,height:2.8})
 decorations.push({kind:'rollerdoor',x:wallX,y:doorY,w:.2,h:3,solid:true,data:{tradeDoor:1,axis:'y',height:2.6,access,faction:'bntg',careerDoor:1,open:0,room:'storage_'+i}})
 put('trade_number',side?42.15:37.65,y+2.8,.8,.08,{deg:side?90:270,z:2.1,height:.35,label:'V0'+(i+1)+' '+labels[i]})
 if(i===7)put('trade_car',44.5,y+2,4.5,1.8,{label:'固定藏品 · 浅蓝色 250 GT'})
 else{put('trade_rack',x+1,y+.5,7,.8);put('trade_pallet',x+1,y+5,2,1,{height:1.2})}
}
put('trade_wall',28,28,10,.2,{height:2.8});put('trade_wall',42,28,10,.2,{height:2.8})
put('trade_security',34,25,2,1,{label:'TGPF / 库区检查'})
put('trade_security',44,25,2,1,{label:'保险库许可 / 检查'})
service('vault_entry','vault_entry',32,25,'inventory/evidence/seal',undefined,0,'trade_terminal')
service('dispatch','transport',12,63,'dispatch/contract/report/evidence',undefined,0,'trade_terminal')
service('receiving','logistics',51,63,'cargo/inspect',undefined,0,'trade_scale')
service('seal','logistics',58,63,'seal/inventory',undefined,0,'trade_seal')
service('packing','logistics',65,63,'cargo/repair',undefined,0,'trade_pack')
for(let x=49;x<71;x+=4)put('trade_pallet',x,68,3,1.5)
for(let i=0;i<3;i++)put('trade_anomaly',49+i*1.4,66,1,.8,{height:.9,label:'TH-001-'+['A','B','C'][i]+' / S-014',manifest:'TH-001',quantity:1,seal:'S-014',fixedCargo:true})
put('trade_cart',70,60,2,1)
put('trade_glass',8,60,6,.12,{height:2.8});put('trade_glass',18,60,6,.12,{height:2.8})
for(const y of [60,66]){
 put('trade_wall',39,y,2,.15,{height:2.6});put('trade_wall',44,y,2,.15,{height:2.6});put('trade_wall',39,y,.15,4,{height:2.6});put('trade_wall',45.85,y,.15,4,{height:2.6});put('trade_wall',39,y+3.85,7,.15,{height:2.6})
 decorations.push({kind:'bed',x:40,y:y+1,w:2,h:2,solid:true})
}
for(const [kind,x,y,w,h] of [['desk',10,67,3,1],['bench',26,62,4,1],['table',28,65,5,2],['bench',26,68,4,1],['trashbin',35,68,1,1],['boiler',70,69,1,1]] as const)decorations.push({kind,x,y,w,h,solid:true})
for(let y=12;y<70;y+=8)for(const x of [7,73])put('trade_column',x,y,.6,.6,{height:3.6})
for(let y=10;y<72;y+=7){put('trade_duct',38,y,4,.3,{z:2.5,height:.15});for(const [x,w] of [[6,8],[20,18],[42,18],[66,8]])put('trade_beam',x,y,w,.3,{z:top(x+.5,y)-.25,height:.2})}
// Existing sanitary furnishings remain independent reusable decorations.
put('trade_wall',24,70,14,.15,{height:2.8})
put('trade_sign',24,69,1,.1,{height:.4,z:1.8,label:'洗手设施 / WC'})
decorations.push({kind:'sink',x:25,y:70.5,w:1,h:.6,solid:true})
put('trade_roof',6,8,68,64,{z:5.5,height:.2})
for(let i=0;i<3;i++){const box=put('trade_anomaly',i===1?46:34,i===2?38:31,1,.8,{height:.9,cargoId:i,label:'TV-00'+(i+1)+' / S-014',faction:'bntg',hidden:1});box.solid=false}
b.staff=[{id:'laozhangfang',x:30,y:25.5},{id:'kui',x:50,y:25.5},{id:'shen',x:18,y:31},{id:'tang',x:18,y:45}]
export const BNTG_BLUEPRINT=b

