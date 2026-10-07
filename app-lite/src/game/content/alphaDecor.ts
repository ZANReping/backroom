import type { Structure } from '../core/types'
import { RESEARCH_NAMES, RESEARCH_DIMENSIONS, researchParts } from './alphaResearchDecor'
import { ARCHIVE_NAMES, ARCHIVE_DIMENSIONS, archiveParts } from './alphaArchiveDecor'
import { ADMIN_NAMES, ADMIN_DIMENSIONS, adminParts } from './alphaAdminDecor'
import { RESIDENTIAL_NAMES, RESIDENTIAL_DIMENSIONS, residentialParts } from './alphaResidentialDecor'
import { COMMUNITY_NAMES, COMMUNITY_DIMENSIONS, communityParts } from './alphaCommunityDecor'

/** Alpha's reusable, metre-scale props. Parts are the single source for mesh and collision. */
export const ALPHA_NAMES = {
 ...RESEARCH_NAMES,...ARCHIVE_NAMES,...ADMIN_NAMES,...RESIDENTIAL_NAMES,...COMMUNITY_NAMES,
  alpha_wall: 'Alpha 灰泥／木护墙墙段', alpha_floor: 'Alpha 地面模块', alpha_ceiling: 'Alpha 吊顶模块',
  alpha_radio: '模拟无线电机柜与操作台', alpha_chair: '黑色管架会议椅', alpha_swivel: '无线电操作转椅',
  alpha_desk: '米色层压板课桌', alpha_board: '黑板与下拉投影幕', alpha_projector: '吊装投影机',
  alpha_rack: '穿孔角钢周转箱货架', alpha_bins: '蓝灰开放周转箱堆', alpha_bunk: '木制双层床与梯子',
  alpha_bed: '值班单人床', alpha_bedside: '床头柜与台灯', alpha_bags: '行囊与换洗衣物',
  alpha_light: '荧光灯／暖色吸顶灯', alpha_blinds: '半透明玻璃窗与百叶帘', alpha_clock: '模拟挂钟',
  alpha_notice: '换班与失物招领公告板', alpha_bench: '走廊休息长椅', alpha_lockers: '编号值班储物柜',
  alpha_water: '饮水与杯具台', alpha_safety: '灭火器与急救壁柜', alpha_mudroom: '外勤挂衣与鞋靴架',
  alpha_cart: '停放补给推车', alpha_planter: '走廊盆栽', alpha_trim: '走廊护墙与防撞条',
  alpha_map: '装框行动地图', alpha_sign: 'Alpha 房间导引牌', alpha_conduit: '表面安装电线管',
} as const
export type AlphaKind = keyof typeof ALPHA_NAMES
export type AlphaSurface = 'plaster'|'wood'|'terrazzo'|'terrazzo_floor'|'fabric'|'metal'|'paint'|'plastic'|'light'|'tile'|'linoleum'|'ceiling'|'soffit'|'carpet'|'glass'|'steel'|'vinyl'|'laminate'|'cabinet_metal'|'office_fabric'|'cardboard'|'packing_tape'|'perforated_metal'|'admin_stone'|'painted_block'|'aquila_concrete'|'cave_rock'|'substrate'|'residential_panel'
export type AlphaPanel = 'radio'|'clock'|'blackboard'|'map'|'label'|'vent'|'notice'|'research_screen'|'lab_paper'|'archive_code'|'archive_screen'|'admin_screen'|'admin_projection'|'shipping_label'|'library_screen'|'residential_art'|'memorial'|'community'
export interface AlphaPart { x:number;y:number;z:number;w:number;d:number;h:number;surface:AlphaSurface;color:string;solid?:boolean;stand?:boolean;shape?:'round'|'rod'|'disc'|'shade'|'globe';panel?:AlphaPanel;text?:string }
const dimensions:Record<AlphaKind,[number,number,number,boolean]> = {
 ...RESEARCH_DIMENSIONS,...ARCHIVE_DIMENSIONS,...ADMIN_DIMENSIONS,...RESIDENTIAL_DIMENSIONS,...COMMUNITY_DIMENSIONS,
 alpha_wall:[3,.18,2.9,true],alpha_floor:[4,4,.12,false],alpha_ceiling:[4,4,.12,false],
 alpha_radio:[4.8,1.15,2.35,true],alpha_chair:[.5,.54,.86,true],alpha_swivel:[.6,.65,1,true],
 alpha_desk:[1.8,.65,.76,true],alpha_board:[6,.15,2.7,false],alpha_projector:[.4,.35,.22,false],
 alpha_rack:[3,.65,2.4,true],alpha_bins:[.65,.48,1.1,true],alpha_bunk:[2.15,1,2.05,true],
 alpha_bed:[2.1,1,.6,true],alpha_bedside:[.5,.45,1.12,true],alpha_bags:[.7,.55,.65,true],
 alpha_light:[1.25,.3,.12,false],alpha_blinds:[2.2,.18,1.45,true],alpha_clock:[.32,.045,.32,false],
 alpha_notice:[1.8,.075,1.05,false],alpha_bench:[2.1,.55,.84,true],alpha_lockers:[1.5,.48,1.85,true],
 alpha_water:[1.2,.55,1.5,true],alpha_safety:[.9,.18,.85,false],alpha_mudroom:[1.8,.48,1.8,true],
 alpha_cart:[.85,.6,.95,true],alpha_planter:[.5,.5,1.2,true],alpha_trim:[3,.055,1.15,false],
 alpha_map:[1.2,.06,.9,false],alpha_sign:[1.5,.04,.3,false],alpha_conduit:[4,.07,.06,false],
}
export const ALPHA_DEFS=Object.entries(ALPHA_NAMES).map(([id,name])=>{const [w,d,height,solid]=dimensions[id as AlphaKind];return {id:id as AlphaKind,name,w,d,height,solid}})
export const isAlphaKind=(kind:string):kind is AlphaKind=>kind in ALPHA_NAMES
export function alphaParts(s:Structure):AlphaPart[]{
 if(s.kind in COMMUNITY_NAMES)return communityParts(s)
 if(s.kind in RESIDENTIAL_NAMES)return residentialParts(s)
 if(s.kind in ADMIN_NAMES)return adminParts(s)
 if(s.kind in ARCHIVE_NAMES)return archiveParts(s)
 if(s.kind in RESEARCH_NAMES)return researchParts(s)
 const def=ALPHA_DEFS.find(d=>d.id===s.kind)!,a:AlphaPart[]=[],w=s.w,d=s.h,H=Number(s.data?.height??def.height),z=Number(s.data?.z??0)
 const skin=String(s.data?.skin??''),color=String(s.data?.color??'#e8dfbd')
 const B=(x:number,y:number,zz:number,ww:number,dd:number,h:number,surface:AlphaSurface='paint',c=color,solid=false,shape?:AlphaPart['shape'],panel?:AlphaPanel,text?:string)=>{if(ww>0&&dd>0&&h>0)a.push({x,y,z:zz+z,w:ww,d:dd,h,surface,color:c,solid,shape,panel,text})}
 const leg=(x:number,y:number,h=.7)=>B(x,y,0,.028,.028,h,'metal','#393d3b',false,'rod')
 const bin=(x:number,y:number,zz:number,bw:number,bd:number,bh:number,c:string,solid=false)=>{
  B(x,y,zz,bw,bd,.025,'plastic',c,solid);B(x,y,zz,.025,bd,bh,'plastic',c,solid);B(x+bw-.025,y,zz,.025,bd,bh,'plastic',c,solid)
  B(x,y,zz,bw,.025,bh,'plastic',c,solid);B(x,y+bd-.025,zz,bw,.025,bh,'plastic',c,solid)
  for(const yy of [y,y+bd-.035]){B(x-.012,yy,zz+bh-.04,bw+.024,.045,.04,'plastic',c);for(let i=1;i<4;i++)B(x+i*bw/4,yy-.014,zz+.02,.018,.025,bh-.035,'plastic',c)}
  B(x+bw*.36,y+bd+.007,zz+bh*.36,bw*.25,.004,bh*.36,'paint','#e9e5d9',false,undefined,'label',String(s.data?.label??'MEG / 014'))
 }
 if(s.kind==='alpha_floor'&&(skin.startsWith('res_')||['aquila','mushroom','library'].includes(skin))){
  const raw=['aquila','mushroom','res_zephyr'].includes(skin)
  B(0,0,-H,w,d,H,raw?'aquila_concrete':skin==='library'?'carpet':skin==='res_crimson'?'linoleum':'vinyl',skin==='mushroom'?'#b1b09b':raw?'#9da6a3':skin==='library'?'#8b8670':skin==='res_river'?'#91a49f':skin==='res_crimson'?'#b3a991':'#b3b4a0');return a
 }
 if(s.kind==='alpha_ceiling'&&(skin.startsWith('res_')||['aquila','mushroom','library'].includes(skin))){
  B(0,0,0,w,d,H,skin==='aquila'||skin==='mushroom'?'aquila_concrete':'ceiling',skin==='aquila'||skin==='mushroom'?'#a4aaa2':'#d6dbd3')
  if(skin.startsWith('res_')||skin==='library'){
   for(let x=(1.2-s.x%1.2)%1.2;x<w;x+=1.2)B(x,0,-.018,.015,d,.019,'metal','#c0c8c0')
   for(let y=(.6-s.y%.6)%.6;y<d;y+=.6)B(0,y,-.018,w,.015,.019,'metal','#c0c8c0')
  }return a
 }
 switch(s.kind){
 case 'alpha_wall':{
  if(skin==='door_frame'){B(0,0,0,w,d,H,'wood',color,true);break}
  if(skin==='aquila'||skin==='mushroom'){B(0,0,0,w,d,H,skin==='mushroom'?'cave_rock':'aquila_concrete',skin==='mushroom'?'#959584':'#b7b9ae',true);break}
  if(skin.startsWith('res_')){
   const timber=skin==='res_zephyr'?'#b69966':skin==='res_river'?'#869989':skin==='res_crimson'?'#97765d':'#b39665',along=w>d,len=along?w:d
   B(0,0,0,w,d,H,'residential_panel',skin==='res_zephyr'?'#cbd5d6':skin==='res_crimson'?'#e0d2b6':'#d6d7c2',true)
   if(z<1.12){B(-.007,-.007,0,w+.014,d+.014,Math.min(H,1.12-z),'wood',timber)
    for(let t=.16;t<len;t+=.16)B(along?t:-.009,along?-.009:t,0,along?.005:w+.018,along?d+.018:.005,Math.min(H,1.12-z),'wood','#716349')
    if(H>1.1)B(-.018,-.018,1.10,w+.036,d+.036,.04,'wood',timber)
   }
   B(-.015,-.015,H-.04,w+.03,d+.03,.04,'paint','#dcdcc9');if(z===0)B(-.01,-.01,0,w+.02,d+.02,.08,'wood','#746249');break
  }
  const wood=skin==='wood',veneer=skin==='admin_veneer';B(0,0,0,w,d,H,wood||veneer?'wood':skin==='transit'?'painted_block':'plaster',wood?'#a77943':color,true)
  if(skin==='executive')B(-.008,-.008,0,w+.016,d+.016,.91,'wood','#836949')
  if(wood){const along=w>d,len=along?w:d;for(let t=.18;t<len;t+=.18)B(along?t:-.004,along?-.004:t,0,along?.009:w+.008,along?d+.008:.009,H,'wood','#58391f')}
  B(-.012,-.012,0,w+.024,d+.024,.13,wood?'wood':'paint',wood?'#553922':'#e6e2ce')
  B(-.018,-.018,H-.065,w+.036,d+.036,.065,wood?'wood':'paint',wood?'#4c301e':'#f5efdb');break
 }
 case 'alpha_floor':B(0,0,-H,w,d,H,skin==='admin_lobby'?'admin_stone':['executive','lecture','archive_office','archive_tech','wood'].includes(skin)?'carpet':skin==='office'?'vinyl':skin==='lab'?'linoleum':skin==='classroom'?'tile':'terrazzo_floor',skin==='admin_lobby'?'#817b65':skin==='executive'?'#6d7667':skin==='lecture'?'#84907d':skin==='transit'?'#9c9d8f':skin==='archive_office'?'#727d7b':skin==='archive_tech'?'#8a8371':skin==='wood'?'#655342':skin==='office'?'#536d8b':skin==='lab'?'#adb3a0':skin==='classroom'?'#dddcd2':skin==='archive'?'#9ea398':'#d2cbb3');break
 case 'alpha_ceiling':
  B(0,0,0,w,d,H,skin==='wood'?'wood':['lab','lecture','admin_lobby','transit'].includes(skin)?'soffit':'ceiling',skin==='wood'?'#51331e':'#eee9d7')
  if(skin==='wood'){for(let x=0;x<w;x+=1.2)B(x,0,-.055,.06,d,.06,'wood','#372417')}
  if(skin==='classroom'||skin==='office'||skin.startsWith('archive')){for(let x=(1.2-s.x%1.2)%1.2;x<w;x+=1.2)B(x,0,-.023,.018,d,.024,'metal','#c8cac5');for(let y=(.6-s.y%.6)%.6;y<d;y+=.6)B(0,y,-.023,w,.018,.024,'metal','#c8cac5')}
  break
 case 'alpha_radio':{
  const n=Math.max(1,Math.round(w/.9)),cw=w/n
  for(let i=0;i<n;i++){
   const x=i*cw;B(x,0,0,cw-.016,.45,H,'paint','#282a28',true)
   for(const dx of [0,cw-.028])B(x+dx,-.012,0,.028,.48,H,'metal','#abb1ae')
   B(x,0,H-.17,cw,.5,.17,'metal','#b5bcbc')
   for(const zz of [.1,.68,1.5,2.0])B(x+.04,.46,zz,cw-.08,.035,.035,'metal','#77827e')
   // Large speaker cones, cream tuning meters, open cable/service bays.
   const v=i%5
   if(v===0||v===4)for(const dx of [.08,cw*.56]){B(x+dx,.475,H-.56,.25,.045,.22,'metal','#a1a7a0');B(x+dx+.03,.512,H-.54,.19,.025,.18,'paint','#252825',false,'disc')}
   if(v===0){B(x+.19,.5,1.32,.37,.022,.37,'paint','#dbdbc6',false,'disc','clock');B(x+.06,.51,.83,cw-.12,.035,.4,'metal','#95998b',false,undefined,'radio')}
   if(v===1||v===2){
    B(x+.05,.47,1.78,cw-.1,.12,.36,'paint','#e8e2c6');B(x+.2,.597,1.85,cw-.28,.012,.17,'paint','#b09446')
    B(x+.08,.48,.24,cw-.16,.018,.73,'paint','#111513');for(let k=0;k<7;k++)B(x+.13+k*.066,.506,.26+(k%2)*.07,.014,.025,.64,'plastic',k%2?'#a3a28c':'#363c32')
   }
   if(v===4)B(x+.06,.51,.22,cw-.12,.035,.36,'metal','#95998b',false,undefined,'radio')
  }
  B(-.03,.44,.73,w+.06,.69,.07,'paint','#f0e7cc',true);B(-.03,1.1,.73,w+.06,.035,.07,'wood','#785331')
  for(const x of [.1,w-.5])B(x,.62,.03,.4,.48,.7,'metal','#898a80',true)
  for(let i=0;i<n;i++){B(i*cw+.25,.71,.805,.23,.18,.07,'plastic','#292e2b');B(i*cw+.36,.81,.87,.024,.024,.2,'metal','#303330',false,'rod')}
  break
 }
 case 'alpha_desk':
  if(skin==='executive'){
   B(0,0,.39,w,d,.065,'wood','#806448',true)
   for(const x of [.06,w-.11])for(const y of [.06,d-.11])B(x,y,0,.055,.055,.40,'wood','#634b34',true)
   B(.09,.12,.12,w-.18,d-.24,.035,'wood','#816749');break
  }
  B(0,0,.715,w,d,.045,'terrazzo','#d3c5a9',true);B(0,d-.018,.704,w,.018,.04,'paint','#353835')
  for(const x of [.12,w-.14]){leg(x,.07);leg(x,d-.09);B(x,.06,.055,.025,d-.11,.026,'metal','#313734')};break
 case 'alpha_chair':case 'alpha_swivel':{
  const swivel=s.kind==='alpha_swivel';B(.02,.04,.43,w-.04,d-.07,.085,'fabric','#242b29',true,'round')
  B(.025,d-.08,.52,w-.05,.085,swivel?.43:.29,'fabric',swivel?'#343631':'#252c29',true,'round')
  if(swivel){B(w/2-.027,d/2-.027,.08,.054,.054,.37,'metal','#676f6b',false,'rod');for(const [ww,dd] of [[w,.05],[.05,d]])B(w/2-ww/2,d/2-dd/2,.08,ww,dd,.045,'plastic','#242b29')}
  else for(const x of [.04,w-.06])for(const y of [.07,d-.08])leg(x,y,.46)
  break
 }
 case 'alpha_board':
  B(0,0,.85,w,.09,1.25,'metal','#b3b5a8');B(.04,.093,.89,w-.08,.012,1.17,'paint','#192725',false,undefined,'blackboard')
  B(0,.08,.84,w,.12,.035,'metal','#c8c9bd')
  B(w*.31,.17,1.24,w*.38,.018,1.36,'paint','#efefe5');B(w*.31-.03,.13,2.59,w*.38+.06,.08,.055,'metal','#d4d4c7');B(w*.31,.16,1.21,w*.38,.04,.035,'metal','#b3b7af');break
 case 'alpha_projector':B(0,0,0,w,d,H,'paint','#d9dad4');B(.08,d-.025,.04,.12,.04,.12,'plastic','#26323a',false,'disc');B(w/2-.024,d/2-.024,H,.048,.048,.28,'metal','#abab9e');break
 case 'alpha_rack':
  for(const x of [0,w-.045])for(const y of [0,d-.045]){B(x,y,0,.045,.045,H,'metal','#a3a490',true);for(let zz=.12;zz<H;zz+=.12)B(x-.001,y+.046,zz,.022,.004,.035,'paint','#454e43')}
  for(let row=0;row<5;row++){const zz=.06+row*(H-.12)/5;B(0,0,zz,w,d,.038,'metal','#acac92',true);B(0,d-.035,zz-.055,w,.035,.055,'metal','#999b83');const n=Math.max(1,Math.floor(w/.62));for(let i=0;i<n;i++)bin(.065+i*(w-.08)/n,.035,zz+.04,(w-.12)/n-.025,d-.06,.33,(row+i)%4===0?'#6e716d':'#202e86')};break
 case 'alpha_bins':for(let i=0;i<3;i++)bin(i*.015,i*.01,i*.24,w-.03,d-.02,.36,skin==='gray'?'#777b73':'#202f91',true);break
 case 'alpha_bunk':case 'alpha_bed':{
  const bunk=s.kind==='alpha_bunk',wood='#795026'
  for(const x of [0,w-.08])for(const y of [0,d-.08])B(x,y,.02,.08,.08,bunk?H:.68,'wood',wood,true)
  for(const zz of (bunk?[.39,1.37]:[.32])){
   B(0,0,zz,w,d,.11,'wood',wood,true);B(.065,.06,zz+.12,w-.13,d-.12,.13,'fabric','#d8d6be',true,'round')
   B(.11,.13,zz+.24,.43,d-.26,.095,'fabric','#f0ebd9',false,'round');B(w*.43,.06,zz+.25,w*.51,d-.12,.04,'fabric',bunk?'#c2beb0':'#dbc89e',false,'round')
   if(zz>1)B(.05,d-.045,zz+.39,w-.1,.045,.12,'wood',wood)
  }
  if(bunk){for(const x of [.47,.96])B(x,d-.08,.03,.055,.09,1.58,'wood',wood,true);for(let zz=.25;zz<1.6;zz+=.28)B(.47,d-.04,zz,.54,.07,.052,'wood','#9e713e')}
  break
 }
 case 'alpha_bedside':
  B(0,0,.56,w,d,.06,'paint','#ddd8c6',true);B(0,0,.1,w,d,.04,'paint','#d4d0bd');for(const x of [0,w-.04])for(const y of [0,d-.04])B(x,y,0,.04,.04,.56,'paint','#d4d0bd',true)
  B(.16,.14,.62,.11,.11,.07,'metal','#ac9c6c',false,'round');B(.2,.18,.68,.025,.025,.21,'metal','#9b8c6d',false,'rod');B(.09,.07,.86,.26,.26,.24,'fabric','#eee4c9',false,'shade')
  B(.31,.12,.62,.1,.13,.17,'paint','#dad2a7');break
 case 'alpha_bags':B(.04,.02,0,w*.63,d*.74,H,'fabric','#233542',true,'round');B(w*.47,.12,0,w*.48,d*.7,H*.6,'fabric','#565346',true,'round');B(.04,.08,H*.88,w*.65,.12,.08,'fabric','#536476');break
 case 'alpha_light':
  if(skin==='louvered'){
   B(0,0,0,w,d,.07,'metal','#7b8987');B(.025,.025,-.03,w-.05,d-.05,.06,'steel','#b8c5bf')
   for(const yy of [d*.26,d*.70])B(.05,yy,-.052,w-.1,.035,.027,'light','#e6f0ed',false,'round')
   for(let x=.10;x<w;x+=.13)B(x,.03,-.077,.013,d-.06,.056,'metal','#afbeb7');break
  }
  if(skin==='downlight'){B(0,0,0,w,d,.045,'steel','#c4cec2',false,'rod');B(.025,.025,-.012,w-.05,d-.05,.026,'light','#fff3ce',false,'rod')}
  else if(skin==='warm'){B(0,0,.07,w,d,.05,'metal','#746343',false,'rod');B(.025,.025,-.06,w-.05,d-.05,.14,'light','#ffdda0',false,'globe')}
  else{B(0,0,0,w,d,.07,'metal','#dddcd1');for(const y of [.035,d-.072])B(.055,y,-.036,w-.11,.038,.038,'light','#fff6df',false,'round')};break
 case 'alpha_blinds':
  // A real pane inside a wall aperture, with frames entirely inside its declared bounds.
  B(.045,d*.45,.045,w-.09,.014,H-.09,'glass','#b9d3cf',true)
  for(const x of [0,w/2-.0225,w-.045])B(x,0,0,.045,d,H,'metal','#c9cec7',true)
  for(const zz of [0,H-.05])B(0,0,zz,w,d,.05,'paint','#e2e0cd',true)
  for(let zz=skin==='open'?H*.72:.08;zz<H-.04;zz+=.055)B(.045,d-.035,zz,w-.09,.035,.028,'paint','#d5d3c5')
  B(w-.09,d-.014,.12,.008,.008,H-.2,'fabric','#bcb9a7');break
 case 'alpha_notice':
  if(skin==='whiteboard'){
   B(0,0,0,w,d,H,'metal','#778176');B(.035,d+.002,.035,w-.07,.009,H-.07,'paint','#e9ebd9')
   B(0,d-.01,.0,w,.08,.025,'metal','#a4ad9d');break
  }
  if(s.data?.stand)for(const x of [.08,w-.12]){B(x,0,-z,.04,.04,z+H,'metal','#596d61');B(x-.12,-.16,-z,.28,.4,.04,'metal','#596d61')}
  B(0,0,0,w,d,H,'wood','#6a5140');B(.04,d+.002,.04,w-.08,.008,H-.08,'paint','#997c53',false,undefined,'notice');break
 case 'alpha_bench':
  for(let i=0;i<4;i++)B(0,.03+i*.12,.44,w,.105,.05,'wood','#a6875c',true)
  for(let i=0;i<3;i++)B(0,.015,.57+i*.085,w,.045,.065,'wood','#95764f')
  for(const x of [.13,w-.19]){B(x,.025,.05,.045,.045,.72,'metal','#54635f',true);B(x,d-.1,.05,.045,.045,.4,'metal','#54635f',true);B(x,.025,.045,.045,d-.08,.04,'metal','#54635f')}
  B(w-.48,.22,.5,.3,.22,.04,'paint','#738979');B(w-.46,.23,.544,.25,.19,.008,'paint','#e1dac5');break
 case 'alpha_lockers':{
  const n=Math.max(1,Math.round(w/.5)),cw=w/n
  B(0,0,.08,w,d,H-.08,'metal','#758680',true)
  for(let i=0;i<n;i++){B(i*cw+.02,d,.12,cw-.04,.018,H-.16,'metal',i%2?'#82958d':'#788b83');B(i*cw+cw-.1,d+.024,.88,.025,.04,.14,'metal','#333e3b');B(i*cw+.1,d+.02,H-.26,cw-.2,.009,.1,'paint','#e5deca',false,undefined,'label',String(12+i));for(let k=0;k<4;k++)B(i*cw+.08,d+.021,H-.43-k*.04,cw-.16,.004,.012,'paint','#374d47')}
  break
 }
 case 'alpha_water':
  B(0,0,0,w*.48,d,.82,'paint','#cdd1c3',true);B(.04,d,.36,w*.4,.025,.29,'paint','#454c47')
  B(w*.13,.08,.82,w*.27,d*.65,.42,'glass','#819fba',false,'rod');B(w*.21,.15,1.24,.13,.13,.06,'plastic','#526f88')
  for(const x of [.15,.33])B(x,d+.025,.62,.045,.045,.055,'plastic',x<.2?'#567992':'#936052')
  B(w*.53,0,.72,w*.47,d,.055,'wood','#a59477',true);for(const x of [w*.56,w-.05])B(x,.04,0,.035,d-.08,.72,'metal','#68736a')
  B(w*.65,.15,.79,.11,.11,.19,'metal','#8b9390',false,'rod');for(let i=0;i<3;i++)B(w*.81,.3,.8+i*.035,.075,.075,.055,'paint','#e7dfcb',false,'rod');break
 case 'alpha_safety':
  B(0,0,.08,.26,.05,.57,'metal','#594f49');B(.03,.045,.13,.2,.13,.42,'paint','#ac3e31',false,'rod');B(.06,.045,.55,.14,.08,.035,'metal','#454840')
  B(.02,d,.64,.27,.014,.15,'paint','#ae4236',false,undefined,'label','FIRE')
  B(.42,0,.2,w-.42,d,.44,'paint','#d8ded1');B(.52,d+.004,.29,.23,.01,.22,'paint','#427a61');B(.607,d+.016,.31,.047,.005,.18,'paint','#edeada');B(.54,d+.016,.38,.18,.005,.046,'paint','#edeada');break
 case 'alpha_mudroom':
  B(0,0,.37,w,d,.055,'wood','#8f7956',true);B(0,0,.08,w,d,.035,'metal','#66736e')
  for(const x of [.04,w-.085])B(x,0,0,.045,d,.4,'metal','#55645f',true)
  B(0,0,1.62,w,.06,.11,'wood','#8f7956')
  for(let i=0;i<3;i++){const x=.18+i*.53;B(x,.045,1.59,.035,.07,.09,'metal','#929887');B(x-.1,.06,.81,.32,.05,.74,'fabric',i%2?'#927751':'#556f6a');B(x-.17,.065,1.12,.075,.06,.34,'fabric','#5b7069');for(const dx of [0,.17]){B(x+dx,.18,.12,.14,.24,.15,'plastic','#514b3e',false,'round');B(x+dx,.18,.25,.13,.13,.09,'fabric','#696052')}}break
 case 'alpha_cart':
  for(const zz of [.18,.67]){B(0,0,zz,w,d,.045,'metal','#8c9991',true);B(0,0,zz+.04,w,.025,.065,'metal','#73817a')}
  for(const x of [.035,w-.07])for(const y of [.035,d-.07]){B(x,y,.13,.035,.035,.59,'metal','#687770');B(x,y,.02,.09,.055,.12,'plastic','#353f3a',false,'disc')}
  B(.015,.02,.74,.035,d-.04,.13,'metal','#63746c');bin(.12,.09,.72,w-.24,d-.18,.22,'#687c77');break
 case 'alpha_planter':
  B(.04,.04,0,w-.08,d-.08,.38,'paint','#9b8570',true,'shade');B(.035,.035,.36,w-.07,d-.07,.035,'paint','#403c2b',false,'rod')
  for(let i=0;i<5;i++){const x=.12+(i%3)*.1,y=.12+(i%2)*.16;B(x,y,.39,.016,.016,.35+i*.075,'wood','#62723f');B(x-.08,y-.05,.63+i*.075,.19,.16,.19,'paint',i%2?'#6b8354':'#4f7152',false,'globe')}break
 case 'alpha_trim':
  B(0,0,0,w,d,H,'paint','#8d9d91');B(0,d,.95,w,.025,.095,'plastic','#617268');B(0,d,.03,w,.024,.075,'paint','#677469');break
 case 'alpha_clock':B(0,0,0,w,d,H,'paint','#f1efdc',false,'disc','clock');break
 case 'alpha_map':B(0,0,0,w,d,H,'wood','#2f3229');B(.05,d,.05,w-.1,.008,H-.1,'paint','#ded7b8',false,undefined,'map');break
 case 'alpha_sign':B(0,0,0,w,d,H,'paint',color,false,undefined,'label',String(s.data?.label??'M.E.G. / ALPHA'));if(skin==='suspended')for(const x of [.15,w-.17])B(x,0,H,.02,.02,.25,'metal','#797c70');break
 case 'alpha_conduit':B(0,0,0,w,d,H,'paint','#e7e1c9');for(let x=.5;x<w;x+=.8)B(x,-.014,-.012,.035,d+.028,H+.024,'metal','#a7ab9c');break
 }
 return a
}
