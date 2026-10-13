/** Shared map orientation. World forward is (-sin(yaw), -cos(yaw)). */
export const mapVision={fov:Math.PI*100/180,range:60,near:1.6}
export function inMapView(dx:number,dy:number,yaw:number){
 const d=Math.hypot(dx,dy)
 return d<=mapVision.near||d<=mapVision.range&&(-Math.sin(yaw)*dx-Math.cos(yaw)*dy)>=d*Math.cos(mapVision.fov/2)
}
/** Exact segment/rectangle visibility for sub-metre partitions. The wall's own
 * map cell is revealable, but cells beyond it remain hidden. */
export function mapWallOccluded(walls:{x:number;y:number;w:number;h:number}[],px:number,py:number,x:number,y:number){
 for(const w of walls){
  let lo=0,hi=1
  for(const [p,d,a,b]of [[px,x-px,w.x,w.x+w.w],[py,y-py,w.y,w.y+w.h]]){
   if(Math.abs(d)<1e-8){if(p<a||p>b){lo=2;break}}
   else{const t0=(a-p)/d,t1=(b-p)/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1))}
  }
  if(lo>hi||hi<.0001||lo>=1)continue
  if(Math.floor(px+(x-px)*(lo+.0001))===Math.floor(x)&&Math.floor(py+(y-py)*(lo+.0001))===Math.floor(y))continue
  return true
 }
 return false
}
export function drawMapPlayer(g:CanvasRenderingContext2D,x:number,y:number,yaw:number,options:{radius?:number;scale:number;alpha?:number;color?:string;sight:{points:readonly {x:number;y:number}[];range:number}}):void{
 const r=options.radius??4,range=Math.max(.001,options.sight.range*options.scale)
 g.save();g.translate(x,y);g.globalAlpha*=options.alpha??1
 const glow=g.createRadialGradient(0,0,0,0,0,range);glow.addColorStop(0,'rgba(255,248,208,.30)');glow.addColorStop(.7,'rgba(255,248,208,.12)');glow.addColorStop(1,'rgba(255,248,208,0)')
 g.fillStyle=glow;g.beginPath();g.moveTo(0,0)
 for(const p of options.sight.points)g.lineTo(p.x*options.scale,p.y*options.scale)
 g.closePath();g.fill();g.rotate(-yaw)
 g.fillStyle=options.color??'#fff4b5';g.strokeStyle='#172c2c';g.lineWidth=r>5?1.8:1.1
 g.beginPath();g.moveTo(0,-r*1.6);g.lineTo(r,r);g.lineTo(0,r*.42);g.lineTo(-r,r);g.closePath();g.fill();g.stroke();g.restore()
}
