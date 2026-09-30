import {useEffect,useRef} from 'react'
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {buildTradeDecor} from '@/game/renderer/tradeMeshes'
import {isTradeKind} from '@/game/content/tradeDecor'
import type {StructEntry} from '@/game/design/types'
import type {Structure} from '@/game/core/types'
/** The editor uses the exact registered mesh builder used by world generation. */
export default function TradeDecorPreview({structure}:{structure:StructEntry}){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  if(!ref.current||!isTradeKind(structure.kind))return
  const renderer=new THREE.WebGLRenderer({canvas:ref.current,antialias:true,alpha:true});renderer.setSize(300,190,false)
  const scene=new THREE.Scene(),model=buildTradeDecor({...structure,x:0,y:0,data:{...structure.data,z:0,deg:structure.deg??0}} as Structure)
  scene.add(model,new THREE.HemisphereLight(0xffffff,0x59616c,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(4,9,5);scene.add(sun)
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length()
  const camera=new THREE.PerspectiveCamera(45,300/190,.01,Math.max(100,size*20));camera.position.copy(center).add(new THREE.Vector3(size*.85,size*.65,size));camera.lookAt(center)
  const controls=new OrbitControls(camera,ref.current);controls.target.copy(center);controls.update()
  const draw=()=>renderer.render(scene,camera);controls.addEventListener('change',draw);draw()
  return ()=>{controls.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();model.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}});geometries.forEach(g=>g.dispose());materials.forEach(m=>{if(m.userData.settlementLabelTexture)(m as THREE.MeshBasicMaterial).map?.dispose();m.dispose()});renderer.dispose()}
 },[structure])
 return isTradeKind(structure.kind)?<figure className="my-2"><canvas ref={ref} aria-label="注册构件三维预览" style={{width:'100%',height:190,touchAction:'none'}}/><figcaption className="text-xs">拖动旋转视角 · 滚轮缩放</figcaption></figure>:null
}
