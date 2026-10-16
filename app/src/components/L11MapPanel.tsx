import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/game/engine'
import { look } from '@/game/core/renderer3d'
import { drawL11Map } from '@/game/content/l11Map'
import { retainL11MapPlans, retryL11MapPlans } from '@/game/content/l11MapPlans'
import { L11_MAP_BUILDINGS, L11_MAP_COLORS as C, L11_MAP_ROOMS, L11_MAP_DISTRICTS, fitL11Map, l11MapContext, mapUnproject, zoomMapView, type L11MapContext, type L11MapView } from '@/game/content/l11MapModel'
import { devMapTeleport } from '@/game/engine/devMap'
import './L11MapPanel.css'

function useMapContext(engine:Engine){
  const [context,setContext]=useState(()=>({...l11MapContext(engine),visit:0}))
  useEffect(()=>{
    const update=()=>{if(engine.player.level!==11||!engine.map?.inf)return;const next=l11MapContext(engine);setContext(old=>old.id===next.id&&old.floor===next.floor&&old.building===next.building?old:{...next,visit:old.visit+Number(old.id!==next.id)})}
    const timer=window.setInterval(update,120)
    return ()=>clearInterval(timer)
  },[engine])
  useEffect(()=>retainL11MapPlans(),[])
  return context
}
const cityContext:L11MapContext={kind:'city',id:'city',floor:0,title:'无限城市'}
function Legend({indoor,metro=false,small=false}:{indoor:boolean;metro?:boolean;small?:boolean}){
  const entry=(label:string,color:string,symbol?:string)=><span className="l11-map-key" key={label}><i style={{background:symbol?'transparent':color,color}}>{symbol}</i>{small?label.split(' / ')[0].replace(' · 箭头向上','').replace('当前位置','位置'):label}</span>
  return <div className={`l11-map-legend${small?' l11-map-legend--small':''}`} aria-label="地图图例">
    {!small&&<strong>图例 <small>LEGEND</small></strong>}
    <div className="l11-map-keys">{indoor?Object.values(L11_MAP_ROOMS).map(e=>entry(e.label,e.color)):metro?<>{entry('步行通道','#e6eff3')}{entry('墙体',C.wall)}</>:Object.values(L11_MAP_BUILDINGS).map(e=>entry(e.label,e.color))}</div>
    <div className="l11-map-keys">{indoor?<>{entry('走廊',C.corridor)}{entry('墙体',C.wall)}{entry('门 / 出入口',C.door,'┄')}{entry('楼梯 · 箭头向上',C.stairs,'▤')}</>:metro?<>{entry('通往地面',C.stairs,'▤')}{entry('未探索',C.unknown)}</>:<>{entry('道路',C.road)}{!small&&entry('主干道',C.arterial)}{!small&&entry('巷道',C.alley)}{entry('步行岸道',C.pedestrian)}{entry('水系',C.water)}{entry('公园',C.park)}{entry('未探索',C.unknown)}</>}</div>
  </div>
}
function L11MapSymbols({indoor,metro}:{indoor:boolean;metro:boolean}){
  const entry=(label:string,color:string,symbol:string)=><span className="l11-map-key" key={label}><i style={{background:'transparent',color}}>{symbol}</i>{label}</span>
  return <div className="l11-map-symbols" data-l11-map-symbols aria-label="地图符号图例">
    {entry('当前位置',C.player,'▲')}{entry('已发现出口',C.exit,'↗')}{!indoor&&!metro&&entry('地铁入口','#376c98','M')}{!indoor&&!metro&&entry('档案馆',C.exit,'A')}{!indoor&&!metro&&entry('建筑入口',C.door,'●')}{entry('可搜刮',C.loot,'▪')}{entry('已搜刮','#84958c','▪')}
  </div>
}
export function L11Minimap({engine,size}:{engine:Engine;size:number}){
  const canvas=useRef<HTMLCanvasElement>(null),context=useMapContext(engine)
  useEffect(()=>{
    const node=canvas.current;if(!node)return
    const draw=()=>{
      if(engine.player.level!==11||!engine.map?.inf)return
      const dpr=Math.min(window.devicePixelRatio||1,2),pixels=Math.round(size*dpr)
      if(node.width!==pixels||node.height!==pixels){node.width=pixels;node.height=pixels}
      const g=node.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0)
      const current=l11MapContext(engine),view=fitL11Map(engine,current,size,size,true)
      const result=drawL11Map(g,engine,{context:current,view,yaw:look.yaw,mini:true})
      node.dataset.mode=result.mode;node.dataset.floor=String(result.floor)
      node.dataset.building=current.building?.id??''
    }
    draw();const timer=window.setInterval(draw,120);return ()=>clearInterval(timer)
  },[engine,size])
  return <div className="l11-minimap" style={{width:size}}>
    {size>=100&&<div className="l11-minimap-title"><b>{context.kind==='interior'?`${context.floor+1}F 室内`:context.kind==='metro'?'B1 地铁':'L11 城市'}</b><span>北向上</span></div>}
    <canvas ref={canvas} data-minimap data-l11-minimap style={{width:size,height:size}} role="img" aria-label={`L11 小地图：${context.title}，${context.floor<0?'B1':`${context.floor+1}F`}，蓝色箭头为当前位置，北向上`}/>
    {size>=100&&<Legend indoor={context.kind==='interior'} metro={context.kind==='metro'} small/>}
  </div>
}
interface Controls {id:string;city:boolean;floor:number|null;zoom:number;x?:number;y?:number}
const defaultControls=(id:string):Controls=>({id,city:false,floor:null,zoom:1})
export default function L11MapPanel({engine,compact=false}:{engine:Engine;compact?:boolean}){
  const context=useMapContext(engine),host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
  const controlId=`${context.id}:${context.visit}`
  const [size,setSize]=useState({width:560,height:420}),[controls,setControls]=useState(()=>defaultControls(controlId))
  const c=controls.id===controlId?controls:defaultControls(controlId)
  const shown=c.city&&context.kind==='interior'?cityContext:context
  const floor=shown.building?Math.min(shown.building.accessible-1,c.floor??context.floor):shown.floor
  const [reveal,setReveal]=useState(()=>engine.devEnabled&&!!engine.dev.mapReveal),[status,setStatus]=useState(''),[message,setMessage]=useState('')
  const view=useRef<L11MapView>({x:0,y:0,scale:1,...size}),drag=useRef<{x:number;y:number;wx:number;wy:number;id:number}|null>(null)
  const centerX=c.x,centerY=c.y,zoomLevel=c.zoom
  useEffect(()=>{
    const sync=()=>setReveal(old=>{const next=engine.devEnabled&&!!engine.dev.mapReveal;return old===next?old:next})
    sync();const timer=window.setInterval(sync,120);return ()=>clearInterval(timer)
  },[engine])
  useEffect(()=>{
    const el=host.current;if(!el)return
    const measure=()=>{const width=Math.max(180,Math.floor(el.clientWidth)),height=Math.max(190,Math.min(window.innerHeight*.43,width*.77,480));setSize(old=>old.width===width&&old.height===Math.floor(height)?old:{width,height:Math.floor(height)})}
    measure();const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure)
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[compact])
  useEffect(()=>{
    const node=canvas.current;if(!node)return
    const draw=()=>{
      if(engine.player.level!==11||!engine.map?.inf)return
      const dpr=Math.min(devicePixelRatio||1,2)
      if(node.width!==Math.round(size.width*dpr)||node.height!==Math.round(size.height*dpr)){node.width=Math.round(size.width*dpr);node.height=Math.round(size.height*dpr)}
      const base=fitL11Map(engine,shown,size.width,size.height),v={...base,x:centerX??base.x,y:centerY??base.y,scale:Math.max(.35,Math.min(28,base.scale*zoomLevel))};view.current=v
      const g=node.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0)
      const result=drawL11Map(g,engine,{context:shown,view:v,yaw:look.yaw,floor,reveal})
      const next=result.error?'底图加载失败，可重试':result.loading?'正在载入已探索城区…':'';setStatus(old=>old===next?old:next)
      node.dataset.mode=result.mode;node.dataset.floor=String(floor);node.dataset.rooms=String(result.rooms);node.dataset.buildings=String(result.buildings)
      node.dataset.building=shown.building?.id??'';node.dataset.view=JSON.stringify({x:v.x,y:v.y,scale:v.scale})
    }
    draw();const timer=window.setInterval(draw,120);return ()=>clearInterval(timer)
  },[engine,size,shown,floor,centerX,centerY,zoomLevel,reveal])
  const change=(patch:Partial<Controls>)=>setControls(old=>({... (old.id===controlId?old:defaultControls(controlId)),...patch,id:controlId}))
  const zoom=(factor:number,px?:number,py?:number)=>{
    if(engine.player.level!==11||!engine.map?.inf)return
    const v=view.current,next=zoomMapView(v,Math.max(.35,Math.min(28,v.scale*factor)),px,py),base=fitL11Map(engine,shown,size.width,size.height)
    change({zoom:next.scale/base.scale,x:next.x,y:next.y})
  }
  const zoomHandler=useRef(zoom);zoomHandler.current=zoom
  useEffect(()=>{
    const el=canvas.current;if(!el)return
    const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect();zoomHandler.current(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),e.clientX-rect.left,e.clientY-rect.top)}
    el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel)
  },[])
  const reset=()=>{setControls(defaultControls(controlId));setMessage('')}
  const floorLabel=floor<0?'B1':`${floor+1}F`
  return <section className={`l11-map-panel${compact?' l11-map-panel--compact':''}`} data-l11-map-panel aria-label="Level 11 城市地图">
    <header className="l11-map-heading"><div><span className="l11-map-eyebrow">LEVEL 11 / CITY ATLAS</span><h3>{shown.title}<small>{shown.kind==='city'?'城市地图':`${floorLabel} · ${shown.kind==='metro'?'地下步行网络':'室内平面图'}`}</small></h3></div><span className="l11-map-badge">{shown.kind==='city'?'街区 · 道路 · 建筑':floorLabel}</span></header>
    <div className="l11-map-toolbar">
      <div className="l11-map-buttons"><button type="button" onClick={()=>zoom(1.3)} aria-label="放大地图">＋</button><button type="button" onClick={()=>zoom(1/1.3)} aria-label="缩小地图">−</button><button type="button" onClick={reset}>跟随位置</button>{context.kind==='interior'&&<button type="button" aria-pressed={c.city} onClick={()=>change({city:!c.city,zoom:1,x:undefined,y:undefined})}>{c.city?'返回室内':'城市总览'}</button>}</div>
      {shown.building&&<div className="l11-map-floors" aria-label="地图楼层"><button type="button" aria-pressed={c.floor===null} onClick={()=>change({floor:null})}>自动</button>{Array.from({length:shown.building.accessible},(_,i)=><button key={i} type="button" aria-label={`查看 ${i+1} 楼地图`} aria-pressed={floor===i} onClick={()=>change({floor:i})}>{i+1}F{context.floor===i?' · 当前':''}</button>)}</div>}
    </div>
    <div className="l11-map-body"><div className="l11-map-main"><div ref={host} className="l11-map-viewport">
      <canvas ref={canvas} data-l11-map-canvas tabIndex={0} role="img" aria-label={`${shown.title} ${floorLabel} 地图。可拖动、滚轮缩放；方向键平移，加减号缩放，Home 跟随位置。`} style={{width:'100%',height:size.height}}
        onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,wx:view.current.x,wy:view.current.y};e.currentTarget.focus()}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;change({x:d.wx-(e.clientX-d.x)/view.current.scale,y:d.wy-(e.clientY-d.y)/view.current.scale})}}
        onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}
        onKeyDown={e=>{const delta=40/view.current.scale;if(e.key==='Home'){e.preventDefault();reset()}else if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.3)}else if(e.key==='-'){e.preventDefault();zoom(1/1.3)}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();change({x:view.current.x+(e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0),y:view.current.y+(e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0)})}}}
        onContextMenu={e=>{e.preventDefault();if(!engine.devEnabled)return;const rect=e.currentTarget.getBoundingClientRect(),[x,y]=mapUnproject(view.current,e.clientX-rect.left,e.clientY-rect.top);void devMapTeleport(engine,{x,y,floor}).then(ok=>setMessage(ok?'已传送到附近可通行位置':'目标位置不可通行')).catch(()=>setMessage('传送失败'))}}
      />
      {status&&<div className="l11-map-status" role="status">{status}{status.includes('失败')&&<button type="button" onClick={retryL11MapPlans}>重试</button>}</div>}
      {shown.building&&floor!==context.floor&&<span className="l11-map-floor-note">正在查看 {floorLabel} · 你在 {context.floor+1}F</span>}
    </div><L11MapSymbols indoor={shown.kind==='interior'} metro={shown.kind==='metro'}/></div><Legend indoor={shown.kind==='interior'} metro={shown.kind==='metro'}/></div>
    {shown.kind==='city'&&<details className="l11-map-district-legend"><summary>区域图例 · 街区底色</summary><div>{Object.values(L11_MAP_DISTRICTS).map(d=><span className="l11-map-key" key={d.label}><i style={{background:d.color}}/>{d.label}</span>)}</div></details>}
    <footer className="l11-map-footer"><span>{shown.kind==='interior'?`开放 ${shown.building!.accessible} 层 / 建筑共 ${shown.building!.floors} 层 · 门洞与楼梯按实际布局显示`:shown.kind==='metro'?'地铁步行网络 · 蓝灰色楼梯通往地面':`${reveal&&engine.devEnabled?'开发模式：完整城区':'仅显示已探索范围'} · 街区底色表示区域用途`}</span><span>拖动平移 · 滚轮 / ＋− 缩放 · 北向上</span></footer>
    {engine.devEnabled&&<label className="l11-map-dev"><input type="checkbox" checked={reveal} onChange={e=>{engine.dev.mapReveal=e.target.checked;setReveal(e.target.checked)}}/>开发：显示未探索城区 <span>右键安全传送</span></label>}
    {message&&<div className="l11-map-message" role="status">{message}</div>}
  </section>
}
