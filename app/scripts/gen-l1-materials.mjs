// Original deterministic foliage/peeling-paint atlases; no downloaded photographic assets.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const dir=resolve('public/textures/l1');mkdirSync(dir,{recursive:true})
let state=1017;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
const save=(c,n)=>writeFileSync(resolve(dir,n+'.png'),c.toBuffer('image/png'))
function leaf(g,x,y,size,angle,tone){
  g.save();g.translate(x,y);g.rotate(angle)
  const grad=g.createLinearGradient(-size,0,size,size)
  grad.addColorStop(0,`rgb(${tone+12},${tone+34},${Math.max(15,tone-20)})`);grad.addColorStop(1,`rgb(${tone-8},${tone+15},${Math.max(10,tone-36)})`)
  g.fillStyle=grad;g.beginPath();g.moveTo(0,-size);g.bezierCurveTo(size*1.2,-size*.4,size*.9,size*.3,0,size*.65);g.bezierCurveTo(-size*.9,size*.3,-size*1.2,-size*.4,0,-size);g.fill()
  g.strokeStyle='rgba(195,205,110,.35)';g.lineWidth=.6;g.beginPath();g.moveTo(0,-size*.85);g.lineTo(0,size*.75);g.stroke();g.restore()
}
for(const kind of ['ivy','ground']){
  const c=createCanvas(512,512),g=c.getContext('2d')
  if(kind==='ground'){g.fillStyle='#28351b';g.fillRect(0,0,512,512)}
  const count=kind==='ivy'?130:2200
  for(let i=0;i<count;i++){
    const x=kind==='ivy'?256+(rnd()-.5)*220:rnd()*512,y=kind==='ivy'?45+rnd()*422:rnd()*512
    if(kind==='ivy'){g.strokeStyle='#4d5330';g.lineWidth=2;g.beginPath();g.moveTo(256+Math.sin(y*.02)*18,y-40);g.lineTo(x,y);g.stroke()}
    leaf(g,x,y,kind==='ivy'?10+rnd()*17:3+rnd()*8,rnd()*6.28,35+rnd()*55)
  }
  save(c,kind)
}
const c=createCanvas(512,512),g=c.getContext('2d');
g.drawImage(await loadImage(resolve('public/textures/l11_concrete.jpg')),0,0,512,512)
for(let i=0;i<19;i++){
  const x=rnd()*512,y=rnd()*512,r=8+rnd()*42;g.fillStyle=i%3?'#bdb59f':'#cfcdc1';g.beginPath()
  for(let j=0;j<32;j++){const a=j/32*Math.PI*2,d=r*(.62+rnd()*.38),px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;j?g.lineTo(px,py):g.moveTo(px,py)}g.closePath();g.fill()
}
for(let i=0;i<4000;i++){g.fillStyle=rnd()>.5?'rgba(210,207,193,.16)':'rgba(65,64,57,.12)';g.fillRect(rnd()*512,rnd()*512,.5+rnd()*2,1+rnd()*5)}
for(let i=0;i<25;i++){g.strokeStyle='rgba(76,73,65,.16)';g.lineWidth=.7;const x=rnd()*512,y=rnd()*512;g.beginPath();g.moveTo(x,y);g.lineTo(x+rnd()*5,y+20+rnd()*80);g.stroke()}
save(c,'peeling')
for(const kind of ['ground','peeling']){
  const rough=createCanvas(256,256),r=rough.getContext('2d');r.fillStyle=kind==='ground'?'#efefef':'#cdcdcd';r.fillRect(0,0,256,256)
  for(let i=0;i<5000;i++){const v=160+Math.floor(rnd()*90);r.fillStyle=`rgb(${v},${v},${v})`;r.fillRect(rnd()*256,rnd()*256,3,3)}save(rough,kind+'-rough')
  const normal=createCanvas(256,256),n=normal.getContext('2d');n.fillStyle='#8080ff';n.fillRect(0,0,256,256)
  for(let i=0;i<8000;i++){n.fillStyle=`rgb(${115+Math.floor(rnd()*26)},${115+Math.floor(rnd()*26)},250)`;n.fillRect(rnd()*256,rnd()*256,2,2)}save(normal,kind+'-normal')
}
console.log('Generated seven deterministic Level 1 material maps in public/textures/l1')
