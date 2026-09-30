export interface L1Puddle {
  x:number; y:number; rx:number; ry:number; angle:number; phase:number
}

function hash(seed:number,a:number,b:number,c:number):number {
  let n=(seed|0)^Math.imul(a|0,0x45d9f3b)^Math.imul(b|0,0x119de1f3)^Math.imul(c|0,0x27d4eb2d)
  n=Math.imul(n^(n>>>16),0x85ebca6b); n=Math.imul(n^(n>>>13),0xc2b2ae35)
  return ((n^(n>>>16))>>>0)/4294967296
}

export function l1Puddles(seed:number,cx:number,cy:number):L1Puddle[]{
  if(hash(seed,cx,cy,0)<.25)return []
  const count=1+Math.floor(hash(seed,cx,cy,1)*4), out:L1Puddle[]=[]
  for(let i=0;i<count;i++){
    let p:L1Puddle|undefined
    for(let attempt=0;attempt<8;attempt++){
      p={x:cx*32+4+hash(seed,cx,cy,i*11+2)*24,y:cy*32+4+hash(seed,cx,cy,i*11+3)*24,
        rx:.45+hash(seed,cx,cy,i*11+4)*1.85,ry:.3+hash(seed,cx,cy,i*11+5)*1.05,
        angle:hash(seed,cx,cy,i*11+6)*Math.PI*2,phase:hash(seed,cx,cy,i*11+7)*Math.PI*2}
      if(out.every(q=>Math.hypot(p!.x-q.x,p!.y-q.y)>=Math.max(p!.rx,p!.ry)+Math.max(q.rx,q.ry)+1))break
      p=undefined
    }
    if(p)out.push(p)
  }
  return out
}

export function l1PuddleContains(p:L1Puddle,x:number,y:number):boolean {
  const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle)
  const u=(dx*c+dy*s)/p.rx,v=(-dx*s+dy*c)/p.ry
  const a=Math.atan2(v,u), jag=.9+.08*Math.sin(a*3+p.phase)+.045*Math.cos(a*7+p.phase*.7)
  return u*u+v*v <= jag*jag
}
