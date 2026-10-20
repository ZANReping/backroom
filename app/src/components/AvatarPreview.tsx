// Shared preview: persistent canvas, manual orbit and anatomy-based framing.
import {useEffect,useRef} from 'react'
import * as THREE from 'three'
import type {AvatarCfg} from '@/game/core/avatar'
import {buildCharacterModel} from '@/game/renderer/characterModel'
import {disposeCharacterModel} from '@/game/renderer/retroResources'
import {buildNpcEntityPreview} from '@/game/renderer/npcEntityPreview'
import {avatarFrame,type AvatarFocus,type AvatarFrame} from '@/game/renderer/avatarFraming'
import type {NpcDef} from '@/game/content/npcs'
interface Props {
 avatar:AvatarCfg;gloves?:boolean;suit?:boolean;cavingsuit?:boolean;divemask?:boolean;headlamp?:boolean;nightvision?:boolean
 npcId?:string;npcDef?:NpcDef;size?:number;focus?:AvatarFocus
}
type PreviewState={scene:THREE.Scene;camera:THREE.PerspectiveCamera;model:THREE.Group|null;focus:AvatarFocus;fit:AvatarFrame|null;reframe:()=>void}
export default function AvatarPreview({avatar,gloves,suit,cavingsuit,divemask,headlamp,nightvision,npcId,npcDef,size=150,focus='body'}:Props){
 const ref=useRef<HTMLCanvasElement>(null),state=useRef<PreviewState|null>(null),orbit=useRef({yaw:0,pitch:0}),drag=useRef<{id:number;x:number;y:number}|null>(null)
 const key=JSON.stringify(avatar)
 useEffect(()=>{
  const canvas=ref.current!,r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1/1.45,.01,20)
  r.setPixelRatio(1);r.setSize(size,Math.round(size*1.45),false);r.outputColorSpace=THREE.SRGBColorSpace
  scene.add(new THREE.AmbientLight(0xffffff,.7));const keyLight=new THREE.DirectionalLight(0xfff2d0,1.3);keyLight.position.set(1.6,2.6,2.2);scene.add(keyLight)
  const rim=new THREE.DirectionalLight(0x9ab0d0,.55);rim.position.set(-2,1.4,-1.6);scene.add(rim)
  const current:PreviewState={scene,camera,model:null,focus:'body',fit:null,reframe:()=>{if(current.model)current.fit=avatarFrame(current.model,camera,current.focus)}};state.current=current
  let raf=0,last=-Infinity,visible=true
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(([e])=>{visible=e.isIntersecting});observer?.observe(canvas)
  const loop=(t:number)=>{
   raf=requestAnimationFrame(loop);if(!visible||document.hidden||t-last<1000/30)return;last=t
   const {model,fit}=current;if(!model||!fit)return
   model.userData.retroUpdate?.(t/1000)
   const {yaw,pitch}=orbit.current,d=fit.distance
   camera.position.set(fit.target.x+Math.sin(yaw)*Math.cos(pitch)*d,fit.target.y+Math.sin(pitch)*d,fit.target.z+Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(fit.target)
   r.render(scene,camera)
  };raf=requestAnimationFrame(loop)
  return()=>{cancelAnimationFrame(raf);observer?.disconnect();if(current.model){scene.remove(current.model);disposeCharacterModel(current.model);current.model=null}state.current=null;drag.current=null;r.dispose();r.forceContextLoss()}
 },[size])
 useEffect(()=>{
  const current=state.current;if(!current)return
  const model=buildNpcEntityPreview(npcId)??buildCharacterModel(JSON.parse(key) as AvatarCfg,{ev:{gloves,suit,cavingsuit,divemask,headlamp,nightvision},npcId,npcDef,driven:true})
  current.model=model;current.scene.add(model);current.reframe()
  return()=>{if(current.model!==model)return;current.scene.remove(model);disposeCharacterModel(model);current.model=null}
 },[key,gloves,suit,cavingsuit,divemask,headlamp,nightvision,npcId,npcDef,size])
 useEffect(()=>{const current=state.current;if(current){current.focus=focus;current.reframe()}},[focus,key,gloves,suit,cavingsuit,divemask,headlamp,nightvision,npcId,npcDef,size])
 return <canvas ref={ref} tabIndex={0} role="img" aria-label="角色预览，可拖动或按方向键旋转，Home 键恢复正面" data-focus={focus}
  style={{width:size,height:Math.round(size*1.45),imageRendering:'auto',touchAction:'none',cursor:'grab'}}
  onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.style.cursor='grabbing'}}
  onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;orbit.current.yaw+=(e.clientX-d.x)*.012;orbit.current.pitch=THREE.MathUtils.clamp(orbit.current.pitch+(e.clientY-d.y)*.007,-.35,.35);d.x=e.clientX;d.y=e.clientY}}
  onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;e.currentTarget.style.cursor='grab';if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
  onPointerCancel={e=>{drag.current=null;e.currentTarget.style.cursor='grab'}} onLostPointerCapture={e=>{drag.current=null;e.currentTarget.style.cursor='grab'}}
  onKeyDown={e=>{const o=orbit.current;if(e.key==='ArrowLeft')o.yaw-=.15;else if(e.key==='ArrowRight')o.yaw+=.15;else if(e.key==='ArrowUp')o.pitch=THREE.MathUtils.clamp(o.pitch-.08,-.35,.35);else if(e.key==='ArrowDown')o.pitch=THREE.MathUtils.clamp(o.pitch+.08,-.35,.35);else if(e.key==='Home'){o.yaw=0;o.pitch=0}else return;e.preventDefault();e.stopPropagation()}}/>
}
