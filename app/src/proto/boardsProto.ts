import '../game/renderer/renderer'
import {boardTexture} from '../game/renderer/settlementMeshes'
document.body.style.cssText='margin:0;background:#222;display:flex;flex-wrap:wrap;gap:12px;padding:12px'
for(const [st,t,w] of [['bntg','中央交易保险库',8],['ariane','医疗大厅 · 免费诊疗与候诊',16],['tom','卡座区',9],['meg','公开办事大厅 · 报案、公告与查询',16],['meg','案件工作岛',12]] as [string,string,number][]){
 const tex=boardTexture(st,t,w,st.length*99+w);const cv=tex.image as HTMLCanvasElement;cv.style.width=Math.min(900,cv.width)/1.4+'px';document.body.appendChild(cv)}
(window as any).__ready=true
