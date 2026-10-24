// Preview of the north-row themed shops (?shop=hardware|workwear|candy|office|outdoor) with the production Traders builders.
// SwiftShader cannot sample the baked probe textures, so this preview uses unbaked materials + plain lights.
import '../game/renderer/renderer'
import * as THREE from 'three'
import {levelDefOf} from '../game/levels'
import {createTradersMap,generateTradersChunk} from '../game/world/tradersWorld'
import {TradersAssets,buildTradersArchitecture} from '../game/renderer/tradersMeshes'
import {buildTradersFitout} from '../game/renderer/tradersFitoutMeshes'
import {TRADERS_SHOPS,tradersShopFrame} from '../game/content/tradersShops'
const q=new URLSearchParams(location.search),W=window as any
try{
 class PreviewAssets extends TradersAssets{material(s:string,c:string){return super.material(s,c,false)}}
 const assets=new PreviewAssets()
 const scene=new THREE.Scene();scene.background=new THREE.Color('#1a1b1d')
 const m=createTradersMap(levelDefOf(102)!,424242);for(let y=0;y<9;y++)for(let x=0;x<14;x++)generateTradersChunk(m,x,y)
 const shop=TRADERS_SHOPS.find(s=>s.id===(q.get('shop')??'hardware'))!,A=tradersShopFrame(shop).r,pad=14,near=(x:number,y:number)=>x>A.x-pad&&x<A.x+A.w+pad&&y>A.y-pad&&y<A.y+A.h+pad
 const root=new THREE.Group();scene.add(root)
 for(const c of m.traders!.chunks.values()){const b=c.bounds as any;const cx=(b.x0??b.x)+((b.x1??(b.x+b.w))-(b.x0??b.x))/2,cy=(b.y0??b.y)+((b.y1??(b.y+b.h))-(b.y0??b.y))/2;if(!near(cx,cy)&&!(Math.abs(cx-(A.x+A.w/2))<A.w/2+40&&Math.abs(cy-(A.y+A.h/2))<A.h/2+40))continue
  const g=new THREE.Group();const it=buildTradersArchitecture(m,c,g,assets);while(!it.next().done){};root.add(g)}
 let fit=0;for(const s of m.structures){if(!s.data?.tradersModel||!near(s.x+s.w/2,s.y+s.h/2))continue;try{const o=buildTradersFitout(s,assets);if(o){root.add(o);fit++}}catch(e){}}
 const npcs=0
 const r=new THREE.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.05;document.body.append(r.domElement)
 scene.add(new THREE.HemisphereLight('#f4f1ea','#5a554d',1.15));scene.add(new THREE.AmbientLight('#ffffff',.35))
 let pl=0;for(const l of m.lights as any[]){const x=l.x,y=l.y;if(x===undefined||!(x>A.x&&x<A.x+A.w&&y>A.y&&y<A.y+A.h))continue;if(pl>=28)break;const p=new THREE.PointLight(l.color??'#fff4e2',10,14,1.6);p.position.set(x,(l.fixZ??4.6)-.25,y);scene.add(p);pl++}
 if(pl<0)for(let i=0;i<4;i++)for(let j=0;j<6;j++){const p=new THREE.PointLight('#fff4e2',16,18,1.6);p.position.set(A.x+A.w*(i+.5)/4,5.2,A.y+A.h*(j+.5)/6);scene.add(p);pl++}
 const cam=new THREE.PerspectiveCamera(Number(q.get('fov')??62),innerWidth/innerHeight,.05,300)
 const [x,y,yaw,pitch,h]=(q.get('cam')??`${A.x+A.w/2},${A.y+A.h+4},0,0,1.65`).split(',').map(Number)
 cam.position.set(x,h||1.65,y);const f=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));cam.lookAt(cam.position.clone().add(f))
 W.__diag={fit,npcs,pl,chunks:m.traders!.chunks.size,A:[A.x,A.y,A.w,A.h],shop:shop.id}
 let n=0;const tick=()=>{r.render(scene,cam);if(++n===40)W.__ready=true;requestAnimationFrame(tick)};setTimeout(tick,4000)
}catch(e){W.__err=String((e as Error).stack??e);console.error(e)}
