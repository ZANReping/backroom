import { createRoot } from 'react-dom/client'
import AvatarEditor from '../src/components/AvatarEditor'
import NpcPortraitImage from '../src/components/NpcPortraitImage'
import { DEFAULT_AVATAR, getAvatar } from '../src/game/core/avatar'
import { storage } from '../src/game/core/storage'
import '../src/index.css'
const memory=new Map<string,string>();storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
const root=createRoot(document.getElementById('root')!)
root.render(<><div id="portrait"><NpcPortraitImage avatar={DEFAULT_AVATAR} size={240} alt="冷启动头像" /></div><AvatarEditor onClose={()=>{}}/></>)
const wait=(t=100)=>new Promise(r=>setTimeout(r,t))
async function check(){
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++}
 for(let i=0;i<100&&!document.querySelector('#portrait img');i++)await wait()
 const image=document.querySelector('#portrait img') as HTMLImageElement
 for(let i=0;i<200&&!image.src.startsWith('data:image/png');i++)await wait()
 ok(image.src.startsWith('data:image/png'),'Cold portrait finishes after textures load, including an early cache hit')
 const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2')
 ok(!!gl,'Editor has WebGL preview')
 const selects=[...document.querySelectorAll('select')]
 const beard=selects.find(s=>[...s.options].some(o=>o.text==='长须'))!
 ok(beard.options.length===9,'All nine beard choices exposed')
 for(const v of [1,2,3,4,5,6,7,8,0,2]){beard.value=String(v);beard.dispatchEvent(new Event('change',{bubbles:true}));await wait(80);ok(getAvatar().beard===v,'Choice saved');ok(!gl!.isContextLost(),'Editing keeps preview context')}
 ok(document.querySelector('canvas')===canvas,'Editor reuses canvas')
 await wait(700)
 ;(window as any).retroUIResult={checks,avatar:getAvatar(),storage:[...memory.keys()]};(window as any).retroUIReady=true
}
check().catch(error=>{console.error(error);(window as any).retroUIResult={error:String(error)};(window as any).retroUIReady=true})
