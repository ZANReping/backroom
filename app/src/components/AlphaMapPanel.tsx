import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/game/engine'
import { look } from '@/game/renderer'
import { ALPHA_MAP_REGIONS, alphaRegionAt, alphaRegionBounds, alphaRegionRooms, alphaRoomColor, alphaRoomName, drawAlphaMap } from '@/game/content/alphaMap'
import { devMapTeleport } from '@/game/engine/devMap'
import { mapSight } from '@/game/world/mapSight'

export default function AlphaMapPanel({engine,compact=false}:{engine:Engine;compact?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null)
 const [selected,setSelected]=useState('auto'),[current,setCurrent]=useState(()=>alphaRegionAt(engine.player.x,engine.player.y)),[available,setAvailable]=useState({width:480,height:400}),[mapStatus,setMapStatus]=useState('')
 const teleporting=useRef(false)
 const region=selected==='auto'?current:selected==='overview'?null:selected
 const bounds=alphaRegionBounds(region),aspect=region?Math.max(.65,Math.min(2,bounds.w/bounds.h)):1
 const sideBySide=compact&&available.width>560,canvasWidth=available.width*(sideBySide?.62:1)
 const height=Math.min(available.height,canvasWidth/aspect),size=Math.min(canvasWidth,height*aspect)
 useEffect(()=>{
  const container=host.current;if(!container)return
  const resize=()=>{
   const width=Math.max(160,Math.min(compact?720:560,container.clientWidth))
   setAvailable({width,height:Math.max(160,innerHeight-(compact?(width>560?140:200):250))})
  }
  const observer=new ResizeObserver(resize);observer.observe(container);window.addEventListener('resize',resize);resize();return()=>{observer.disconnect();window.removeEventListener('resize',resize)}
 },[compact])
 useEffect(()=>{
  const c=canvas.current;if(!c)return
  const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(size*dpr);c.height=Math.round(height*dpr)
  const g=c.getContext('2d')!;g.setTransform(dpr,0,0,dpr,0,0)
  const draw=()=>{setCurrent(alphaRegionAt(engine.player.x,engine.player.y));drawAlphaMap(g,size,engine.player,{region,yaw:look.yaw,height,sight:mapSight(engine,look.yaw)})}
  draw();const timer=setInterval(draw,150);return()=>clearInterval(timer)
 },[engine,size,height,region])
 const name=ALPHA_MAP_REGIONS.find(r=>r.id===region)?.name
 const rooms=region?alphaRegionRooms(region):[]
 return <div ref={host} className="flex w-full flex-col items-center gap-2" style={compact?{width:'min(88vw, 720px)',maxHeight:'85vh',overflowY:'auto'}:undefined} data-alpha-map={region??'overview'}>
  <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs">
   <strong style={{color:'var(--text)'}}>ALPHA / {name??'全基地导览'}</strong>
   <div className="flex shrink-0 gap-2 whitespace-nowrap">
    <button className="menu-btn px-2 py-1" aria-pressed={selected==='overview'} onClick={()=>setSelected('overview')}>全基地</button>
    <button className="menu-btn px-2 py-1" aria-pressed={selected==='auto'} onClick={()=>setSelected('auto')}>跟随所在区</button>
   </div>
  </div>
  <select aria-label="查看 Alpha 地图区块" value={selected} onChange={e=>setSelected(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" style={{background:'var(--panel)',color:'var(--text)',borderColor:'var(--panel-edge)'}}>
   <option value="auto">自动 · 进入区域后显示房间</option><option value="overview">全基地 · 署区与入口</option>
   {ALPHA_MAP_REGIONS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
  </select>
  <div className="flex w-full justify-center gap-3" style={{flexDirection:sideBySide?'row':'column',alignItems:sideBySide?'flex-start':'center'}}>
  <canvas ref={canvas} role="img" aria-label={`Alpha 基地${name??'总览'}地图，黄色箭头为当前位置，红点为出口`} style={{width:size,height,maxWidth:'100%',flexShrink:0,border:'1px solid #6a7a70',borderRadius:3}} onContextMenu={async e=>{
   if(!engine.devEnabled)return
   e.preventDefault()
   if(teleporting.current)return
   const c=e.currentTarget,r=c.getBoundingClientRect(),pixelX=(e.clientX-r.left)*size/r.width,pixelY=(e.clientY-r.top)*height/r.height
   const pad=22,scale=Math.min((size-pad*2)/bounds.w,(height-pad*2)/bounds.h),ox=(size-bounds.w*scale)/2-bounds.x*scale,oy=(height-bounds.h*scale)/2-bounds.y*scale
   const x=(pixelX-ox)/scale,y=(pixelY-oy)/scale
   teleporting.current=true;setMapStatus('正在检查落点…')
   try{const ok=await devMapTeleport(engine,{x,y,floor:engine.player.floor});setMapStatus(ok?`已传送到 ${x.toFixed(1)}, ${y.toFixed(1)}`:'附近没有安全落点，原位置保留')}catch{setMapStatus('无法传送，原位置保留')}finally{teleporting.current=false}
  }}/>
  <div className="flex flex-col gap-2" style={{width:sideBySide?undefined:'100%',flex:sideBySide?1:undefined,minWidth:0,maxHeight:sideBySide?available.height:undefined,overflowY:sideBySide?'auto':undefined}}>
  <div className="flex w-full flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{color:'var(--text-dim)'}}>
   <span>▲ 你的位置</span><span style={{color:'#e78579'}}>● 返回 Level 1</span><span>白色缺口：门</span>{rooms.some(r=>r.access)&&<span>许可区保留原门禁</span>}
  </div>
  <div className="grid w-full gap-x-3 gap-y-1 text-[11px]" style={{color:'var(--text-dim)',gridTemplateColumns:sideBySide?'1fr':'repeat(2,minmax(0,1fr))'}}>
   {region?rooms.map(r=><span key={r.id}><i style={{background:alphaRoomColor(r),display:'inline-block',width:8,height:8,marginRight:5}}/>{alphaRoomName(r)}</span>):ALPHA_MAP_REGIONS.map(r=><span key={r.id}><i style={{background:r.color,display:'inline-block',width:8,height:8,marginRight:5}}/>{r.name}</span>)}
  </div>
  </div>
  </div>
  {mapStatus&&<div className="text-[11px]" style={{color:'var(--text-dim)'}}>{mapStatus}</div>}
 </div>
}
