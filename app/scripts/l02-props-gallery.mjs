import fs from 'node:fs'
import path from 'node:path'
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas'
const root=path.resolve(import.meta.dirname,'../reports/l02-props-20261030')
GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc','QA Sans')
const cases=[['coneClose','L0.2 锥桶',[700,340,520,480]],['entranceSign','人字警示牌',[620,270,720,600]],['lampClose','施工灯支架与落点',[580,140,760,760]],['sinkClose','洗手盆与龙头',[700,410,900,600]],['toiletClose','马桶内部',[700,210,520,670]]]
const width=600,height=390,pad=30,c=createCanvas(width*2,cases.length*(height+pad)+50),g=c.getContext('2d')
g.fillStyle='#172027';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f0f2f4';g.font='21px "QA Sans"';g.fillText('实际游戏截图对照｜左：修复前　右：修复后（真实光影）',15,32)
for(let row=0;row<cases.length;row++)for(let col=0;col<2;col++){
 const [name,label,crop]=cases[row],image=await loadImage(path.join(root,col?'final-realistic':'final-before',name+'.png')),x=col*width,y=50+row*(height+pad)
 g.drawImage(image,...crop,x,y,width,height);g.fillStyle='#eff3f6';g.font='17px "QA Sans"';g.fillText((col?'修复后 · ':'修复前 · ')+label,x+12,y+height+22)
}
fs.writeFileSync(path.join(root,'comparison.png'),c.toBuffer('image/png'))
console.log('Saved comparison.png')
