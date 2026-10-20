import {useEffect,useMemo,useRef,useState,type ImgHTMLAttributes} from 'react'
import type {AvatarCfg} from '@/game/core/avatar'
import type {NpcDef} from '@/game/content/npcs'
import {cachedNpcPortrait,npcPortraitKey,requestNpcPortrait} from './npcPortrait'

type Props=Omit<ImgHTMLAttributes<HTMLImageElement>,'src'>&{avatar:AvatarCfg;npcId?:string;npcDef?:NpcDef;size?:number;framing?:'full'|'identity'}
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="139" viewBox="0 0 96 139"><rect width="96" height="139" fill="#242520"/><circle cx="48" cy="47" r="23" fill="#626253"/><path d="M8 139v-23c0-32 80-32 80 0v23" fill="#626253"/></svg>')
export default function NpcPortraitImage({avatar,npcId,npcDef,size=96,framing='full',alt,...props}:Props){
 const avatarKey=JSON.stringify(avatar),image=useRef<HTMLImageElement>(null)
 const request=useMemo(()=>({avatar:JSON.parse(avatarKey) as AvatarCfg,npcId,npcDef,size,framing}),[avatarKey,npcId,npcDef,size,framing])
 const key=npcPortraitKey(request),[result,setResult]=useState<{key:string;src:string}>(()=>({key,src:cachedNpcPortrait(request)??''}))
 useEffect(()=>{
  let cancel:(()=>void)|undefined,observer:IntersectionObserver|undefined,live=true
  const start=()=>{if(!live||cancel)return;cancel=requestNpcPortrait(request,src=>{if(live)setResult({key,src})})}
  if(cachedNpcPortrait(request)||typeof IntersectionObserver==='undefined')start()
  else{observer=new IntersectionObserver(entries=>{const visible=entries.some(e=>e.isIntersecting);if(visible)start();else{cancel?.();cancel=undefined}},{rootMargin:'100px'});if(image.current)observer.observe(image.current)}
  return()=>{live=false;observer?.disconnect();cancel?.()}
 },[request,key])
 const src=result.key===key&&result.src?result.src:cachedNpcPortrait(request)??placeholder
 return <img {...props} ref={image} alt={alt} src={src} decoding="async" width={props.width??size} height={props.height??Math.round(size*1.45)} />
}
