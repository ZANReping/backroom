import type { L11Building } from './l11Types'
import type { Point } from './l11Geometry'
import { l11BoxSolid,transformL11Solid } from './l11Solid'

export interface L11ExitPart {x:number;y:number;z:number;w:number;h:number;d:number;angle?:number;surface:'concrete'|'brick'|'metal'|'glass'|'sealedglass'|'plaster';color?:string}
/** These boxes are used before meshes load, and again by all rendered LODs. */
export function l11SpecialBuildingParts(b:L11Building):L11ExitPart[]{
  const out:L11ExitPart[]=[],W=b.width,D=b.depth,H=b.floors*3
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11ExitPart['surface']='concrete',color?:string,angle=0)=>out.push({x,y,z,w,h,d,surface,color,angle})
  if(b.archetype==='unfinished-frame'){
    const nx=Math.ceil(W/5),nz=Math.ceil(D/5),shaft=b.exit?.kind==='l11liftshaft',q=b.exit
    for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
      const x=.25+(W-.5)*i/nx,z=.25+(D-.5)*j/nz
      if(shaft&&Math.hypot(x-b.doorLocal[0],z-b.doorLocal[1])<1.6)continue
      if(shaft&&q&&Math.abs(x-q.center[0])<2.5&&Math.abs(z-q.center[1])<3.5)continue
      // Keep a clear route from the facade to the open shaft.
      if(i>0&&i<nx&&j>0&&j<nz&&q){const a=b.doorLocal,c=q.center,dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<1.5)continue}
      box(x,H/2,z,.5,H,.5)
    }
    for(let f=0;f<=b.floors;f++){
      // Structural slabs continue around the shaft; there is no slab through it.
      if(shaft&&q){const halfX=Math.abs(Math.cos(q.angle))*1.14+Math.abs(Math.sin(q.angle))*1.26,halfZ=Math.abs(Math.sin(q.angle))*1.14+Math.abs(Math.cos(q.angle))*1.26,cx=q.center[0]-Math.sin(q.angle)*1.26,cz=q.center[1]+Math.cos(q.angle)*1.26,x0=cx-halfX,x1=cx+halfX,z0=cz-halfZ,z1=cz+halfZ
        for(const [x,z,w,d]of [[0,0,x0,D],[x1,0,W-x1,D],[x0,0,x1-x0,z0],[x0,z1,x1-x0,D-z1]])if(w>0&&d>0)box(x+w/2,f*3-.14,z+d/2,w,.28,d)
      }else box(W/2,f*3-.14,D/2,W,.28,D)
      if(f<b.floors){for(let i=0;i<=nx;i++)box(.25+(W-.5)*i/nx,f*3+2.68,D/2,.46,.35,D);for(const z of [.25,D-.25])box(W/2,f*3+2.65,z,W,.38,.5)}
    }
    if(b.sealed){
      // Ground-level infill prevents a closed shell implying an accessible interior.
      box(W/2,1.5,.12,W,3,.24);box(W/2,1.5,D-.12,W,3,.24);box(.12,1.5,D/2,.24,3,D);box(W-.12,1.5,D/2,.24,3,D)
      box(W*.22,H/2,D*.72,W*.16,H,D*.19) // unfinished concrete stair/lift core, no fitted interior
    }else{
      // Low perimeter parapets make upper slabs legible from side/rear views.
      for(let f=1;f<b.floors;f+=2)box(W/2,f*3+.35,D-.12,W,.7,.24)
    }
    for(let i=0;i<=nx;i++)for(const z of [.25,D-.25]){const x=.25+(W-.5)*i/nx;for(const dx of [-.13,.13])box(x+dx,H+.4,z,.025,.8,.025,'metal','#685a4c')}
  }else if(b.archetype==='barred-brick'){
    const angle=b.doorAngle-b.angle,span=b.front==='n'||b.front==='s'?W:D,depth=b.front==='n'||b.front==='s'?D:W
    const midpoint:Point=[b.doorLocal[0]-Math.cos(angle)*span*.29,b.doorLocal[1]-Math.sin(angle)*span*.29]
    const face=(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11ExitPart['surface']='brick',color?:string)=>box(midpoint[0]+Math.cos(angle)*x-Math.sin(angle)*z,y,midpoint[1]+Math.sin(angle)*x+Math.cos(angle)*z,w,h,d,surface,color,angle)
    // A small wooden doorway sits left of a much larger barred industrial window.
    // Looking in from -Z, positive local X is screen-left.
    const door=span*.29,window=-span*.15,winW=Math.min(3.7,span*.3),sill=1.05,head=4.85,left=window-winW/2,right=window+winW/2,groundTop=5.1
    face(0,H/2,depth-.16,span,H,.32);face(-span/2+.16,H/2,depth/2,.32,H,depth);face(span/2-.16,H/2,depth/2,.32,H,depth)
    face(0,(H+groundTop)/2,0,span,H-groundTop,.32)
    for(const [a,b]of [[-span/2,left],[right,door-.75],[door+.75,span/2]])face((a+b)/2,groundTop/2,0,b-a,groundTop,.32)
    face(door,(groundTop+2.44)/2,0,1.5,groundTop-2.44,.32);face(door,1.2,.1,1.5,2.4,.14,'sealedglass','#302c22')
    face(window,sill/2,0,winW,sill,.32);face(window,(head+groundTop)/2,0,winW,groundTop-head,.32)
    face(window,(sill+head)/2,.03,winW,head-sill,.035,'glass','#a5aba4')
    // Recessed timber/metal glazing bars and pale lower panels sit behind the
    // iron grille, as in the supplied brick-front reference.
    face(window,(sill+head)/2,.18,winW,head-sill,.06,'sealedglass','#646d67')
    for(let x=left+.34;x<right;x+=.68){face(x,(sill+head)/2,-.035,.065,head-sill,.12,'metal','#6a4034');face(x+.29,sill+.67,-.005,.5,1.2,.08,'plaster','#e6e1cb')}
    for(const x of [left,right])face(x,(sill+head)/2,-.2,.11,head-sill+.18,.18,'metal','#292e2c')
    for(const y of [sill,head])face(window,y,-.2,winW+.2,.14,.2,'metal','#292e2c')
    for(let x=left+.16;x<right;x+=.21)face(x,(sill+head)/2,-.34,.035,head-sill,.045,'metal','#202927')
    for(const y of [1.9,3.5,4.55])face(window,y,-.34,winW,.065,.055,'metal','#202927')
    face(window,sill-.12,-.28,winW+.2,.22,.55,'metal','#343c33')
    face(door,2.58,-.16,1.68,.22,.55,'plaster','#e1ddce')
    face(door,2.92,-.27,.24,.27,.25,'metal','#343b35');face(door,3.08,-.29,.34,.06,.3,'metal','#343b35')
    box(W/2,-.09,D/2,W,.18,D);for(let y=6;y<H;y+=3)box(W/2,y-.09,D/2,W,.18,D)
    face(0,H-.1,0,span+.18,.22,.5,'concrete','#bcbeb3');box(W/2,H-.25,D/2,W,.25,D)
    // Upper floors retain actual depth and modest window openings in the brickwork.
    for(let y=7;y<H-1;y+=3)for(let x=-span/2+2;x<span/2-1;x+=3.4){face(x,y,-.18,1.3,1.6,.05,'sealedglass','#434e4d');face(x,y-.86,-.24,1.55,.12,.3,'concrete','#c1bdb0')}
  }
  return out
}
export function l11ShaftParts(b:L11Building):L11ExitPart[]{
  const q=b.exit;if(q?.kind!=='l11liftshaft')return []
  const H=b.floors*3,c=Math.cos(q.angle),s=Math.sin(q.angle)
  const part=(x:number,y:number,z:number,w:number,h:number,d:number,surface:L11ExitPart['surface']='concrete',color?:string):L11ExitPart=>({x:q.center[0]+c*x-s*z,y,z:q.center[1]+s*x+c*z,w,h,d,angle:q.angle,surface,color})
  const height=H+3.5,mid=(H-3.5)/2
  return [part(-1.32,mid,1.3,.36,height,3.1),part(1.32,mid,1.3,.36,height,3.1),part(0,mid,2.7,3,height,.36),part(0,2.73,-.08,2.35,.54,.4),part(0,-1.75,-.08,2.35,3.5,.4),part(0,-3.56,1.3,2.28,.12,2.7,'concrete','#333936'),part(-.85,mid,2.44,.08,height,.08,'metal'),part(.85,mid,2.44,.08,height,.08,'metal')]
}
export function l11ExitDoorSolid(b:L11Building){
  const q=b.exit;if(!q||q.kind==='l11liftshaft'||q.kind==='basebeta')return []
  return [transformL11Solid(l11BoxSolid(0,q.floor*3+1.15,0,q.width,2.3,.09),...q.center,q.angle)]
}
export const l11ExitPartSolid=(p:L11ExitPart)=>transformL11Solid(l11BoxSolid(0,p.y,0,p.w,p.h,p.d),p.x,p.z,p.angle??0)
export function l11ArchiveBackingParts(b:L11Building):L11ExitPart[]{
  // Close the former window bay with a full-height wall before mounting the door.
  return b.id==='l11:public-archive'?[{x:.12,y:1.5,z:25,w:.24,h:3,d:4.9,surface:'plaster',color:'#dfdbcc'}]:[]
}
