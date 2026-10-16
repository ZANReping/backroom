// Review-only contact sheets of unmodified headless game screenshots.
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {writeFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const folder=fileURLToPath(new URL('../reports/l11-props/',import.meta.url)),mode=process.argv[2]??'realistic'
const groups=[['street','bus_shelter','hydrant','streetlight','trash_bin','manhole','storm_drain','bus','delivery_bike','shopping_cart'],['service','phone_booth','vending_machine','market_stall','cafe_table','hvac','pallet_stack','cable_reel','cement_mixer','cone'],['furniture','life_ring','park_bench','park_lamp','fountain','sofa','bed','office_desk','exhibit_case','wash_basin']]
for(const [name,...keys] of groups){
  const available=keys.filter(key=>existsSync(path.join(folder,`${mode}-prop-${key}.jpg`)))
  if(!available.length)continue
  const w=640,h=360,canvas=createCanvas(w*3,Math.ceil(available.length/3)*(h+32)+52),ctx=canvas.getContext('2d')
  ctx.fillStyle='#121917';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#eef1e8';ctx.font='24px Arial';ctx.fillText(`LEVEL 11 | ${mode} | ${name} | seed 20261006`,18,34)
  for(const [i,key] of available.entries()){
    const x=i%3*w,y=Math.floor(i/3)*(h+32)+52,img=await loadImage(path.join(folder,`${mode}-prop-${key}.jpg`))
    ctx.drawImage(img,x,y,w,h);ctx.fillStyle='#eef1e8';ctx.font='19px Arial';ctx.fillText(key.replaceAll('_',' '),x+12,y+h+23)
  }
  writeFileSync(path.join(folder,`${mode}-contact-${name}.jpg`),canvas.toBuffer('image/jpeg',92))
}
