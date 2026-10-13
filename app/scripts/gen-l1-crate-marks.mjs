// Original vector stencils, arranged from the supplied shipping-crate reference.
// No photograph pixels are included. 100 numbers share one mipmapped atlas.
import {createCanvas} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
const out=resolve('public/textures/l1/crate-marks.png'),canvas=createCanvas(1024,1024),ctx=canvas.getContext('2d'),cell=102.4
for(let n=0;n<100;n++){
 ctx.save();ctx.translate(n%10*cell,Math.floor(n/10)*cell)
 ctx.beginPath();ctx.rect(2,2,cell-4,cell-4);ctx.clip()
 ctx.fillStyle='rgba(117,19,10,.92)';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1.2
 ctx.save();ctx.scale(.5,1);ctx.font='bold 34px Georgia';ctx.fillText(String(n),10,38);ctx.restore()
 ctx.save();ctx.translate(24,68);ctx.scale(.48,1);ctx.rotate(-.38);ctx.font='bold 9px Georgia';ctx.fillText('EXPO ARTE POPULAR',0,0);ctx.restore()
 for(const x of [64,69]){ctx.fillRect(x,74,1.6,13);ctx.beginPath();ctx.moveTo(x-2,77);ctx.lineTo(x+.8,71);ctx.lineTo(x+3.5,77);ctx.fill()}
 ctx.beginPath();ctx.moveTo(77,72);ctx.lineTo(84,72);ctx.lineTo(83,80);ctx.lineTo(80.5,82);ctx.lineTo(78,80);ctx.closePath();ctx.fill();ctx.fillRect(80,80,1,7);ctx.fillRect(78,87,5,1)
 ctx.beginPath();ctx.arc(93,79,6,Math.PI,2*Math.PI);ctx.lineTo(87,79);ctx.fill();ctx.beginPath();ctx.moveTo(93,78);ctx.lineTo(93,86);ctx.quadraticCurveTo(93,89,90,87);ctx.stroke()
 ctx.font='bold 3px Georgia';ctx.fillText('ARRIBA',61,93);ctx.fillText('FRAGIL',76,93);ctx.fillText('NO MOJAR',87,93)
 ctx.restore()
}
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,canvas.toBuffer('image/png'))
