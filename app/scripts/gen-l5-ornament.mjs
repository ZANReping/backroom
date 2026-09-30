// Original repeatable ornament, drawn for the supplied hotel references. No photo is embedded.
import { createCanvas } from '@napi-rs/canvas'
import { mkdir, writeFile } from 'node:fs/promises'
const dir = new URL('../public/textures/l5/', import.meta.url)
await mkdir(dir, { recursive: true })
let seed=5029
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
function canvas(w,h,bg){const c=createCanvas(w,h),g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,w,h);return[c,g]}
function line(g,color,width,fn){g.strokeStyle=color;g.lineWidth=width;g.beginPath();fn();g.stroke()}
function leaf(g,x,y,r,a,color){g.save();g.translate(x,y);g.rotate(a);g.fillStyle=color;g.beginPath();g.moveTo(0,0);g.bezierCurveTo(-r*.5,-r*.35,-r*.35,-r*.9,0,-r);g.bezierCurveTo(r*.4,-r*.8,r*.5,-r*.3,0,0);g.fill();line(g,'#59472c',.7,()=>{g.moveTo(0,0);g.lineTo(0,-r*.9)});g.restore()}
function scroll(g,x,y,r,a,color){g.save();g.translate(x,y);g.rotate(a);line(g,'#422d20',7,()=>{for(let i=0;i<=90;i++){const t=i/90*Math.PI*2.2,q=r*(1-i/110);const X=Math.sin(t)*q,Y=-Math.cos(t)*q;if(i===0)g.moveTo(X,Y);else g.lineTo(X,Y)}});line(g,color,3.8,()=>{for(let i=0;i<=90;i++){const t=i/90*Math.PI*2.2,q=r*(1-i/110);const X=Math.sin(t)*q,Y=-Math.cos(t)*q;if(i===0)g.moveTo(X,Y);else g.lineTo(X,Y)}});for(let i=0;i<8;i++){const t=i/8*4.3,q=r*(1-i/10);leaf(g,Math.sin(t)*q,-Math.cos(t)*q,r*.42,t+.7,color)}g.restore()}
function flower(g,x,y,r,c1,c2,n=8){g.save();g.translate(x,y);for(let i=0;i<n;i++)leaf(g,0,0,r,i/n*Math.PI*2,c1);g.fillStyle=c2;g.beginPath();g.arc(0,0,r*.18,0,7);g.fill();g.restore()}
function octagon(g,x,y,r,color,fill){g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8,X=x+Math.cos(a)*r,Y=y+Math.sin(a)*r;if(!i)g.moveTo(X,Y);else g.lineTo(X,Y)}g.closePath();if(fill){g.fillStyle=fill;g.fill()}g.strokeStyle=color;g.lineWidth=3;g.stroke()}
async function save(c,name,fiber=6){const g=c.getContext('2d'),im=g.getImageData(0,0,c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const j=(y*c.width+x)*4,n=(rnd()-.5)*fiber+(y%2?1.5:-1.5)+(x%3?0:-1);for(let k=0;k<3;k++)im.data[j+k]=Math.max(0,Math.min(255,im.data[j+k]+n))}g.putImageData(im,0,0);await writeFile(new URL(name+'.jpg',dir),c.toBuffer('image/jpeg',92))}
{
 const[c,g]=canvas(1024,1024,'#a8a987');
 for(let y=-128;y<1152;y+=256)for(let x=-128;x<1152;x+=256){
  octagon(g,x,y,152,'#727b65','#d5cba3');octagon(g,x,y,138,'#9b4434');octagon(g,x,y,124,'#e7d5a7','#8d9f8e');octagon(g,x,y,105,'#627562','#e2d2ad');
  flower(g,x,y,69,'#a7764a','#983e2a',8);flower(g,x,y,42,'#6f927f','#bb5d3c',4);
  for(let a=0;a<8;a++){const t=a*Math.PI/4;flower(g,x+Math.cos(t)*112,y+Math.sin(t)*112,12,'#a7523c','#e4c18b',5)}
  flower(g,x+128,y+128,38,'#a45136','#4f796e',4);
 }
 await save(c,'lobby_carpet',15)
}
{
 const[c,g]=canvas(1024,1024,'#762b21');
 for(let y=-256;y<=1280;y+=512)for(let x=-256;x<=1280;x+=512){
  for(let a=0;a<4;a++){const t=a*Math.PI/2;scroll(g,x+Math.sin(t)*100,y+Math.cos(t)*100,112,t,'#bd9558');scroll(g,x+Math.sin(t+.785)*186,y+Math.cos(t+.785)*186,62,-t,'#a47743')}
  flower(g,x,y,128,'#c0a16a','#854035',8);flower(g,x,y,84,'#706b49','#d2b57a',8);flower(g,x,y,41,'#be804f','#6c3024',6)
 }
 await save(c,'corridor_carpet',18)
}
{
 const[c,g]=canvas(1024,256,'#803b2e');
 for(const y of [12,26,230,244])line(g,'#d5b27c',4,()=>{g.moveTo(0,y);g.lineTo(1024,y)});
 for(let x=-64;x<1152;x+=128){scroll(g,x,130,69,Math.PI/2,'#c8aa76');flower(g,x+64,122,38,'#8f9a77','#d5bd86',6)}
 await save(c,'rug_border',12)
}
{
 const[c,g]=canvas(512,1024,'#7a251c');
 for(let y=-256;y<1280;y+=256)for(let x=-128;x<640;x+=256){
  const X=x+((y/256)%2?128:0);for(const s of [-1,1]){g.save();g.translate(X,y);g.scale(s,1);scroll(g,44,70,45,0,'#a97845');scroll(g,42,-52,36,Math.PI,'#b98c51');leaf(g,0,50,110,0,'#a2733e');g.restore()}
 }
 await save(c,'damask',7)
}
{
 const[c,g]=canvas(1024,256,'#3d271d');
 // Repeated painted cartouches with scrollwork and central urns.
 for(let x=0;x<1024;x+=512){
  g.fillStyle='#9f7748';g.beginPath();g.roundRect(x+12,21,488,214,88);g.fill();g.strokeStyle='#2b2119';g.lineWidth=10;g.stroke();
  for(const s of [-1,1]){g.save();g.translate(x+256,128);g.scale(s,1);scroll(g,109,8,69,Math.PI/2,'#653c29');leaf(g,8,28,125,.85,'#623a28');g.restore()}
  g.fillStyle='#512d21';g.beginPath();g.moveTo(x+224,67);g.bezierCurveTo(x+234,164,x+278,164,x+288,67);g.closePath();g.fill();g.fillRect(x+223,62,66,9);g.fillRect(x+247,141,18,35);g.fillRect(x+225,176,62,9);
  flower(g,x+256,46,25,'#6f442b','#cda06a',8)
 }
 await save(c,'frieze',4)
}
{
 const[c,g]=canvas(512,512,'#69231c');
 // Small mottled cut pile, not a large print, for the plain corridor.
 for(let n=0;n<130000;n++){const x=rnd()*512,y=rnd()*512;g.fillStyle=['#8b3929','#5d1f1a','#9c4b35','#713024'][n%4];g.fillRect(x,y,1+rnd(),1+rnd())}
 await save(c,'plain_carpet',7)
}
console.log('Generated 6 original hotel ornament maps.')
