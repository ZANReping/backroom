import type {Structure} from '../core/types'
export type DressingKind='firecabinet'|'firstaid'|'wallphone'|'clock'|'notice'|'camera'|'radiator'|'outlet'|'whiteboard'|'archive'|'teapoint'|'bedkit'|'copyhub'|'mailboxes'|'packingbench'|'janitor'|'washcounter'|'wcstall'|'urinal'|'conference'|'suitcase'|'coatstand'|'ticket'|'mapboard'|'trayreturn'|'utility'|'rug'|'bedside'|'securitydesk'|'tabletop'|'monitors'|'storageRack'|'palletLoad'|'coldcabinet'|'officescreen'|'mkStall'|'mkRack'|'mkCheckout'|'mkService'|'mkCarts'|'mkBoard'|'mkDockDoor'|'mkForklift'|'mkWrap'|'mkJack'|'mkPalletStack'|'mkFloor'|'mkHangSign'|'shopPiece'
/** Width/depth and upper/bottom bounds in the same local coordinates as the meshes. */
export const DRESSING_SIZE:Record<DressingKind,readonly [number,number,number,number]>={
 firecabinet:[.76,.28,1.96,.32],firstaid:[.52,.22,2.0,1.30],wallphone:[.30,.30,1.85,1.02],clock:[.52,.18,2.62,2.08],notice:[2.8,.18,2.42,.88],camera:[.40,.64,2.92,2.43],radiator:[1.5,.18,.82,.12],outlet:[.16,.09,.51,.25],whiteboard:[2.7,.20,2.4,.86],archive:[2.4,.48,2.12,0],teapoint:[2.4,.70,2.28,0],bedkit:[1.2,2.1,1.02,0],copyhub:[1.6,.9,1.48,0],mailboxes:[2.4,.48,1.9,0],packingbench:[3.4,1.05,2.0,0],janitor:[1.1,.65,1.75,0],washcounter:[3.2,.75,2.25,0],wcstall:[1.55,1.85,2.15,0],urinal:[.54,.48,1.30,.45],conference:[8,2.2,.79,0],suitcase:[.65,.48,.98,0],coatstand:[.65,.65,1.86,0],ticket:[.62,.65,1.48,0],mapboard:[3.2,.20,2.42,.88],trayreturn:[1.9,.70,1.30,0],utility:[1.2,.22,2.14,.32],rug:[4,2.5,.008,0],bedside:[.48,.42,.67,0],securitydesk:[2.6,.85,1.65,0],tabletop:[.50,.40,1.04,.76],monitors:[3.6,.24,2.72,1.10],storageRack:[3.7,.75,2.2,0],palletLoad:[2,1.3,1.0,0],coldcabinet:[3.8,.75,1.18,0],officescreen:[2.8,.42,1.30,0],mkStall:[12,12,4.2,0],mkRack:[8.1,1.1,4.15,0],mkCheckout:[4.6,1.0,1.05,0],mkService:[9,1.15,1.1,0],mkCarts:[4.6,2.4,1.1,0],mkBoard:[1.1,.25,2.3,0],mkDockDoor:[4.2,.22,4.4,0],mkForklift:[1.25,3.3,2.3,0],mkWrap:[1.7,1.7,2.4,0],mkJack:[.68,1.6,1.2,0],mkPalletStack:[1.22,1.02,1.4,0],mkFloor:[60,80,.02,0],mkHangSign:[1,.06,4.8,2.8],shopPiece:[1,1,2.4,0]}
export function tradersLocalStructure(s:Structure):Structure{
 const w=Number(s.data?.localW??s.w),h=Number(s.data?.localD??s.h),x=s.x+s.w/2,y=s.y+s.h/2
 return{...s,x:x-w/2,y:y-h/2,w,h}
}
export function placedTradersStructure(kind:Structure['kind'],cx:number,cy:number,w:number,d:number,solid:boolean,data:NonNullable<Structure['data']>):Structure{
 const a=Number(data.deg??0)*Math.PI/180,c=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a)),ww=w*c+d*sn,dd=w*sn+d*c
 return{kind,x:cx-ww/2,y:cy-dd/2,w:ww,h:dd,solid,data:{...data,localW:w,localD:d}}
}
export function tradersDressingColliders(s:Structure){
 if(!s.solid)return[]
 const kind=s.data?.dressing as DressingKind,[,,high,low]=DRESSING_SIZE[kind],w=Number(s.data?.localW??s.w),d=Number(s.data?.localD??s.h),top=Number(s.data?.height??high),bottom=Number(s.data?.bottom??low),pieces:{x:number;z:number;w:number;d:number;bottom:number;top:number}[]=[]
 const add=(x:number,z:number,ww:number,dd:number,tt=top,bb=bottom)=>pieces.push({x,z,w:ww,d:dd,top:tt,bottom:bb})
 if(kind==='wcstall'){add(-w/2+.03,0,.06,d);add(w/2-.03,0,.06,d);add(0,-.43,.67,.85,.80,0)}
 else if(kind==='coatstand')add(0,0,.30,.30)
 else if(kind==='packingbench'){add(0,0,w,d,1.0,0);add(0,-d/2+.04,w,.08,top,1)}
 else if(kind==='mkStall'){add(0,d/2-.45,6.2,.9,1.05,0);for(const x of [-w/2+.45,w/2-.45])add(x,0,.9,d,2.3,0);add(0,-d/2+.45,w,.9,2.3,0);for(const x of [-4.25,4.25])add(x,d/2-.6,2.05,1.2,1.25,0);add(0,-1.0,5.2,1.0,1.55,0)}
 else if(kind==='mkCarts')add(0,0,w,d,1.1,0)
 else add(0,0,w,d)
 const angle=Number(s.data?.deg??0)*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),cx=s.x+s.w/2,cy=s.y+s.h/2
 return pieces.map(p=>{const pts=[[-p.w/2,-p.d/2],[-p.w/2,p.d/2],[p.w/2,-p.d/2],[p.w/2,p.d/2]].map(([x,z])=>[cx+(x+p.x)*c+(z+p.z)*sn,cy-(x+p.x)*sn+(z+p.z)*c]);return{x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),y0:Math.min(...pts.map(p=>p[1])),y1:Math.max(...pts.map(p=>p[1])),bottom:p.bottom,top:p.top,stand:false}})
}
