import {useEffect,useRef,useState} from 'react'
import type {Engine} from '@/game/engine'
import {look} from '@/game/renderer'
import {mapSight} from '@/game/world/mapSight'
import {devMapTeleport} from '@/game/engine/devMap'
import {drawTradersMap,TRADERS_MAP_LEGEND} from '@/game/content/tradersMap'
import {TRADERS_BOUNDS} from '@/game/content/tradersLayout'
import './TradersMapPanel.css'

export default function TradersMapPanel({engine,compact=false}:{engine:Engine;compact?:boolean}){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
 const view=useRef({x:TRADERS_BOUNDS.x+TRADERS_BOUNDS.w/2,y:TRADERS_BOUNDS.y+TRADERS_BOUNDS.h/2,zoom:1})
 const drag=useRef<{id:number;x:number;y:number;cx:number;cy:number}|null>(null),teleporting=useRef(false)
 const [size,setSize]=useState({w:560,h:368}),[status,setStatus]=useState('')
 const fit=Math.min((size.w-24)/TRADERS_BOUNDS.w,(size.h-24)/TRADERS_BOUNDS.h)
 useEffect(()=>{
  const h=host.current;if(!h)return
  const resize=()=>{const w=Math.max(160,Math.min(compact?820:720,h.clientWidth));setSize({w,h:Math.max(160,Math.min(innerHeight-(compact?200:280),w*.72))})}
  const observer=new ResizeObserver(resize);observer.observe(h);window.addEventListener('resize',resize);resize()
  return()=>{observer.disconnect();window.removeEventListener('resize',resize)}
 },[compact])
 useEffect(()=>{
  const c=canvas.current;if(!c)return
  const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(size.w*dpr);c.height=Math.round(size.h*dpr)
  const g=c.getContext('2d')!;g.setTransform(dpr,0,0,dpr,0,0)
  const draw=()=>{if(!engine.map?.traders)return;const v=view.current;drawTradersMap(g,engine.map,{width:size.w,height:size.h,centerX:v.x,centerY:v.y,scale:fit*v.zoom,playerX:engine.player.x,playerY:engine.player.y,yaw:look.yaw,sight:mapSight(engine,look.yaw)})}
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();const r=c.getBoundingClientRect(),px=(e.clientX-r.left)*size.w/r.width-size.w/2,py=(e.clientY-r.top)*size.h/r.height-size.h/2,v=view.current
   const old=fit*v.zoom;v.zoom=Math.max(.7,Math.min(14,v.zoom*Math.exp(-e.deltaY*.0015)));const next=fit*v.zoom
   v.x+=px/old-px/next;v.y+=py/old-py/next;draw()
  }
  c.addEventListener('wheel',wheel,{passive:false});draw();const timer=setInterval(draw,100)
  return()=>{clearInterval(timer);c.removeEventListener('wheel',wheel)}
 },[engine,size.w,size.h,fit])
 const reset=(near=false)=>{view.current={x:near?engine.player.x:TRADERS_BOUNDS.x+TRADERS_BOUNDS.w/2,y:near?engine.player.y:TRADERS_BOUNDS.y+TRADERS_BOUNDS.h/2,zoom:near?5:1}}
 const endDrag=(id:number)=>{if(drag.current?.id===id)drag.current=null}
 return <div ref={host} className="traders-map-panel" data-traders-map="overview" style={compact?{width:'min(88vw,820px)'}:undefined}>
  <div className="traders-map-head"><strong>商人之家 / TRADERS KEEP</strong><div><button className="menu-btn px-2 py-1" onClick={()=>reset()}>全据点</button><button className="menu-btn px-2 py-1" onClick={()=>reset(true)}>当前位置</button></div></div>
  <p className="traders-map-help">拖动平移 · 滚轮缩放{engine.devEnabled?' · 右键安全传送':''}</p>
  <canvas ref={canvas} style={{width:size.w,height:size.h}} role="img" aria-label="商人之家区域地图，黄色箭头为位置和朝向，红点为返回 Level 1 的门" onPointerDown={e=>{
   if(e.button!==0)return
   drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,cx:view.current.x,cy:view.current.y};e.currentTarget.setPointerCapture(e.pointerId)
  }} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const r=e.currentTarget.getBoundingClientRect(),k=fit*view.current.zoom;view.current.x=d.cx-(e.clientX-d.x)*size.w/r.width/k;view.current.y=d.cy-(e.clientY-d.y)*size.h/r.height/k}}
   onPointerUp={e=>endDrag(e.pointerId)} onPointerCancel={e=>endDrag(e.pointerId)} onLostPointerCapture={e=>endDrag(e.pointerId)} onContextMenu={async e=>{
    if(!engine.devEnabled)return
    e.preventDefault();if(teleporting.current)return
    const r=e.currentTarget.getBoundingClientRect(),v=view.current,k=fit*v.zoom,x=v.x+((e.clientX-r.left)*size.w/r.width-size.w/2)/k,y=v.y+((e.clientY-r.top)*size.h/r.height-size.h/2)/k
    teleporting.current=true;setStatus('正在检查落点…')
    try{setStatus(await devMapTeleport(engine,{x,y,floor:engine.player.floor})?'已传送至安全落点':'附近没有安全落点，原位置保留')}catch{setStatus('无法传送，原位置保留')}finally{teleporting.current=false}
   }}/>
  <div className="traders-map-legend">{TRADERS_MAP_LEGEND.map(([color,name])=><span key={name}><i style={{background:color}}/>{name}</span>)}<span>▲ 当前位置</span><span>● 返回 Level 1</span></div>
  <p className="traders-map-help">浅蓝库房：冷藏 · 暗红库房：高安 · 交通连接尚未开通</p>
  <small role="status" aria-live="polite">{status}</small>
 </div>
}
