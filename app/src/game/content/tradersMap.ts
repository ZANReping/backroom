import {TRADERS_BOUNDS,TRADERS_SHOP_GLAZING,TRADERS_DOORS,TRADERS_ROOMS,TRADERS_WALLS,TRADERS_ZONES,TRADERS_ENTRIES} from './tradersLayout'
import {drawMapPlayer} from './mapPlayer'
import type {GameMap} from '../world/mapgen'
import type {mapSight} from '../world/mapSight'

export const TRADERS_MAP_LEGEND=[['#b8c1b5','公共大厅'],['#c9c7ab','拱顶步行街'],['#d6bd8e','编号空铺'],['#9d8ca8','交易保险库'],['#a6b6ad','后勤与交通'],['#9eb9c2','办公与服务'],['#b9a5bd','生活区']] as const
const colors:Record<string,string>={hall:'#b8c1b5',street:'#c9c7ab',shop:'#d6bd8e',anchor:'#bca578',vault:'#9d8ca8',logistics:'#a6b6ad',rail:'#919b98',dock:'#a6b6ad',office:'#9eb9c2',dorm:'#b9a5bd',guard:'#879e94',bank:'#aebfc3',food:'#d4ac84',market:'#c8bd8e',court:'#b3c6b7'}
let cachedPlan:HTMLCanvasElement|OffscreenCanvas|undefined
/** A bounded 2D atlas of the lightweight plan; never creates runtime chunks. */
function planCanvas(){
 if(cachedPlan)return cachedPlan
 const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(840,552):document.createElement('canvas')
 c.width=840;c.height=552
 const g=c.getContext('2d') as CanvasRenderingContext2D
 g.fillStyle='#b8c1b5';g.fillRect(0,0,840,552)
 const rect=(r:{x:number;y:number;w:number;h:number},fill:string)=>{g.fillStyle=fill;g.fillRect((r.x-TRADERS_BOUNDS.x)*2,(r.y-TRADERS_BOUNDS.y)*2,r.w*2,r.h*2)}
 for(const z of TRADERS_ZONES)rect(z,colors[z.kind]??colors.hall)
 for(const r of TRADERS_ROOMS){rect(r,r.storage==='secure'?'#a47b80':r.storage==='cold'?'#89aab8':colors[r.kind]??colors.hall)}
 for(const w of TRADERS_WALLS)if(w.bottom<1.8)rect(w,'#43534d')
 for(const glass of TRADERS_SHOP_GLAZING)rect(glass,'#719d9b')
 cachedPlan=c;return c
}
export interface TradersMapOptions{width:number;height:number;centerX:number;centerY:number;scale:number;playerX:number;playerY:number;yaw:number;sight:ReturnType<typeof mapSight>;mini?:boolean}
export function drawTradersMap(g:CanvasRenderingContext2D,m:GameMap,o:TradersMapOptions){
 const {width,height,centerX,centerY,scale:k,mini=false}=o,ox=width/2-centerX*k,oy=height/2-centerY*k
 g.save();g.clearRect(0,0,width,height);g.fillStyle='#26322f';g.fillRect(0,0,width,height)
 g.beginPath();g.rect(0,0,width,height);g.clip()
 g.drawImage(planCanvas() as CanvasImageSource,ox+TRADERS_BOUNDS.x*k,oy+TRADERS_BOUNDS.y*k,TRADERS_BOUNDS.w*k,TRADERS_BOUNDS.h*k)
 const open=new Set(m.traders?.base.filter(s=>s.data?.tradersDoor&&s.data.open).map(s=>String(s.data!.tradersId)))
 for(const d of TRADERS_DOORS){g.fillStyle=open.has(d.id)?'#e6eee1':'#55665d';g.fillRect(ox+d.x*k,oy+d.y*k,Math.max(1,d.w*k),Math.max(1,d.h*k))}
 if(!mini){
  g.textAlign='center';g.textBaseline='middle'
  for(const r of TRADERS_ROOMS){
   if(r.w*k<22||r.h*k<12)continue
   const x=ox+(r.x+r.w/2)*k,y=oy+(r.y+r.h/2)*k
   if(x<0||y<0||x>width||y>height)continue
   g.font=(r.kind==='vault'?'9px':'600 11px')+' system-ui';g.fillStyle='#273532';g.fillText(r.name,x,y,Math.max(16,r.w*k-4))
  }
 }
 for(const e of TRADERS_ENTRIES){g.fillStyle='#ed8d79';g.beginPath();g.arc(ox+e.x*k,oy+e.y*k,mini?2.5:4,0,Math.PI*2);g.fill()}
 drawMapPlayer(g,ox+o.playerX*k,oy+o.playerY*k,o.yaw,{scale:k,radius:mini?3.5:5,color:'#fff4b5',sight:o.sight})
 g.restore()
}
