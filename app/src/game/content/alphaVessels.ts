import type {AlphaPart} from './alphaDecor'

/** Open ceramic wall + inner floor; liquid lies below the rim, never on a closed cap. */
export function alphaCupParts(x:number,y:number,z:number,width=.10,height=.11,color='#c4c4a6',drink:'coffee'|'water'='coffee'):AlphaPart[]{
 return [
  {x,y,z,w:width,d:width,h:height,surface:'paint',color,shape:'cup'},
  {x:x+width*.83,y:y+width*.39,z:z+height*.22,w:width*.42,d:width*.22,h:height*.56,surface:'paint',color,shape:'cup_handle'},
  {x:x+width*.105,y:y+width*.105,z:z+height*.78,w:width*.79,d:width*.79,h:.001,surface:drink,color:drink==='coffee'?'#49301b':'#a7c4bd',shape:'liquid_disc'},
 ]
}

/** Carve the actual worktop/cabinet volume, then line the cavity with thin steel. */
export function insetAlphaBasin(parts:AlphaPart[],x:number,y:number,rim:number,w:number,d:number,depth=.17,filled=true){
 const bottom=rim-depth,wall=.012,lo=bottom+wall
 for(let i=parts.length-1;i>=0;i--){
  const p=parts[i]
  if(p.shape||p.yaw||p.z+p.h<=lo||p.z>=rim+.012||p.x>=x+w||p.x+p.w<=x||p.y>=y+d||p.y+p.d<=y)continue
  const x0=Math.max(x,p.x),x1=Math.min(x+w,p.x+p.w),y0=Math.max(y,p.y),y1=Math.min(y+d,p.y+p.d),z0=Math.max(lo,p.z),z1=Math.min(rim+.012,p.z+p.h)
  const cut=(xx:number,yy:number,zz:number,ww:number,dd:number,hh:number)=>{if(ww>.0001&&dd>.0001&&hh>.0001)parts.push({...p,x:xx,y:yy,z:zz,w:ww,d:dd,h:hh})}
  parts.splice(i,1)
  cut(p.x,p.y,p.z,x0-p.x,p.d,p.h);cut(x1,p.y,p.z,p.x+p.w-x1,p.d,p.h)
  cut(x0,p.y,p.z,x1-x0,y0-p.y,p.h);cut(x0,y1,p.z,x1-x0,p.y+p.d-y1,p.h)
  cut(x0,y0,p.z,x1-x0,y1-y0,z0-p.z);cut(x0,y0,z1,x1-x0,y1-y0,p.z+p.h-z1)
 }
 const B=(xx:number,yy:number,zz:number,ww:number,dd:number,hh:number,color='#a2b3ad')=>parts.push({x:xx,y:yy,z:zz,w:ww,d:dd,h:hh,surface:'steel',color})
 B(x,y,bottom,w,d,wall,'#83958e')
 for(const xx of [x,x+w-wall])B(xx,y,bottom,wall,d,depth)
 for(const yy of [y,y+d-wall])B(x+wall,yy,bottom,w-wall*2,wall,depth)
 for(const xx of [x-.015,x+w-wall])B(xx,y-.015,rim-.006,wall+.015,d+.03,.012)
 for(const yy of [y-.015,y+d-wall])B(x,yy,rim-.006,w,wall+.015,.012)
 parts.push({x:x+w*.5-.022,y:y+d*.5-.022,z:bottom+wall+.001,w:.044,d:.044,h:.002,surface:'metal',color:'#465852',shape:'rod'})
 if(filled)parts.push({x:x+wall+.002,y:y+wall+.002,z:rim-depth*.48,w:w-wall*2-.004,d:d-wall*2-.004,h:.001,surface:'water',color:'#a7c4bd',shape:'liquid_plane'})
}
