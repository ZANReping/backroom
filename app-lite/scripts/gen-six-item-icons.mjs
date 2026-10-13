// Only the three silhouette/palette corrections. 32px originals, nearest 4x.
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const out=fileURLToPath(new URL('../public/textures/icons/pixel/',import.meta.url))
for(const type of ['luckymilk','pockets','fuyouyu']){
  const c=createCanvas(32,32),g=c.getContext('2d');g.lineWidth=1.4;g.strokeStyle='#292e27'
  const rect=(x,y,w,h,color)=>{g.fillStyle=color;g.fillRect(x,y,w,h);g.strokeRect(x+.5,y+.5,w-1,h-1)}
  const ellipse=(x,y,rx,ry,color)=>{g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();g.stroke()}
  if(type==='luckymilk'){
    g.fillStyle='#c0cfba';g.beginPath();g.moveTo(12,5);g.lineTo(20,5);g.lineTo(20,10);g.lineTo(23,14);g.lineTo(23,28);g.quadraticCurveTo(16,31,9,28);g.lineTo(9,14);g.lineTo(12,10);g.closePath();g.fill();g.stroke()
    rect(11,2,10,4,'#babdaf');rect(11,15,10,12,'#e5e1c7');rect(9,16,14,8,'#c2c9a1');g.fillStyle='#3f5138';g.fillRect(12,18,8,2);g.fillRect(13,21,6,1);g.fillStyle='#eff2d7';g.fillRect(10,11,2,5)
  }else if(type==='pockets'){
    for(const left of [false,true]){
      g.save();g.translate(16,16);if(left)g.rotate(Math.PI)
      g.fillStyle='#b8c8cb';g.beginPath();g.moveTo(2,0);g.lineTo(4,-6);g.lineTo(8,-5);g.lineTo(6,-2);g.lineTo(11,-2);g.lineTo(9,0);g.lineTo(15,3);g.lineTo(13,6);g.lineTo(8,4);g.lineTo(3,1);g.closePath();g.fill();g.stroke()
      g.strokeStyle='#506777';g.lineWidth=1;g.beginPath();g.moveTo(4,-2);g.lineTo(6,0);g.lineTo(12,3);g.moveTo(8,1);g.lineTo(8,-1);g.stroke()
      g.fillStyle='#e9bd52';g.fillRect(5,-3,2,2);g.fillRect(10,2,2,2);g.restore()
    }
    ellipse(16,16,5,4.5,'#caa34b');ellipse(16,15,3.5,3,'#16afd4')
    g.fillStyle='#4fec72';g.fillRect(17,13,2,3);g.fillStyle='#aef9ed';g.fillRect(14,13,2,1);g.fillStyle='#eef879';g.fillRect(18,15,1,1)
  }else{
    g.strokeStyle='#863e32';g.lineWidth=2;g.beginPath();g.moveTo(14,14);g.lineTo(12,5);g.lineTo(16,2);g.lineTo(20,5);g.lineTo(18,14);g.stroke();g.strokeStyle='#2b3928';ellipse(16,21,9,9,'#6c8250');ellipse(16,21,3,3,'#23322a')
    g.strokeStyle='#a2af7c';g.lineWidth=1;g.beginPath();g.moveTo(10,17);g.lineTo(11,22);g.lineTo(13,24);g.stroke();g.fillStyle='#899a62';g.fillRect(20,17,2,5);g.fillStyle='#9d4d3b';g.fillRect(14,10,4,3)
  }
  const pixels=g.getImageData(0,0,32,32);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]<128?0:255;g.putImageData(pixels,0,0)
  const big=createCanvas(128,128),b=big.getContext('2d');b.imageSmoothingEnabled=false;b.drawImage(c,0,0,128,128);writeFileSync(`${out}item_${type}.png`,big.toBuffer('image/png'))
}
console.log('Updated only luckymilk, pockets and fuyouyu pixel icons')
