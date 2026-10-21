import {drawFactionSign,highVoltageTexture,type SignStyle} from '../game/renderer/factionSigns'
const items:[SignStyle,string,string,string?][]=[
 ['meg','101 Alpha 门牌','档案室 / ARCHIVES'],['meg','L1 指路牌','M.E.G. ALPHA / CORE'],['meg','L8 第九大道路标','第九大道 / NINTH AVE · 07'],['meg','115 Beta 入口','M.E.G. BETA / 出口 EXIT'],
 ['bntg','102 店招','01 / 食品'],['bntg','102 报价','B.N.T.G. / 今日报价'],['bntg','L1 入口','商人之家 / B.N.T.G. TRADE POST'],['ariane','103 服务台','医疗大厅 · 免费诊疗与候诊','公共服务 · 按 E 查看'],
 ['ariane','L1 入口','希波克拉底-1 / ARIANE CLINIC'],['tom','104 服务台','点餐柜台 / ORDER HERE','公共服务 · 按 E 查看'],['tom','L1 入口',"Tom's Diner / 餐馆 · 由此进入"],['argos','116 服务台','案件工作岛 · 案卷与线索','工作人员 · 资格核验'],
 ['argos','L1 入口','丰饶角 / ARGOS CORNUCOPIA'],['brc','L1 B.R.C.','B.R.C. 联络处 · 协作工单','公共服务 · 按 E 查看'],['industrial','L9/L10/L7','LEVEL 11  →'],['brass','L5 房号','317'],
]
const g=document.getElementById('g')!
for(const [st,label,text,sub] of items){const d=document.createElement('div');d.className='c';const cv=document.createElement('canvas');const asp=sub?2.67:3.4;cv.width=1024;cv.height=Math.round(1024/asp);drawFactionSign(cv.getContext('2d')!,0,0,cv.width,cv.height,st,text,sub);d.append(cv);const t=document.createElement('div');t.textContent=`${st} · ${label}`;d.append(t);g.append(d)}
{const d=document.createElement('div');d.className='c';const t=highVoltageTexture('42');const cv=t.image as HTMLCanvasElement;cv.style.width='160px';d.append(cv);const l=document.createElement('div');l.textContent='warningsign 高压警示';d.append(l);g.append(d)}
;(window as any).__ready=true
