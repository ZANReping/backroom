// Reproducible visual comparison; browser environments differ, no performance claim.
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=new URL('../reports/l1-remake/',import.meta.url)
const ids=['parking-common','storage','ouroboros','garden','path-room','crate']
const sheet=createCanvas(1440,1380),ctx=sheet.getContext('2d')
ctx.fillStyle='#171c1f';ctx.fillRect(0,0,sheet.width,sheet.height)
for(let i=0;i<ids.length;i++){
 const x=(i%2)*720,y=Math.floor(i/2)*460,id=ids[i]
 ctx.fillStyle='#fff';ctx.font='17px sans-serif';ctx.fillText(id+'   previous | current',x+10,y+24)
 for(const [iteration,dx]of [['iteration-3',0],['iteration-4',360]]){
  const image=await loadImage(fileURLToPath(new URL(`${iteration}/current/reference/${id}.png`,root)))
  const k=Math.min(348/image.width,415/image.height)
  ctx.drawImage(image,x+dx+(360-image.width*k)/2,y+36+(415-image.height*k)/2,image.width*k,image.height*k)
 }
}
mkdirSync(new URL('iteration-4/comparison/',root),{recursive:true})
writeFileSync(new URL('iteration-4/comparison/previous-current.jpg',root),sheet.toBuffer('image/jpeg'))
console.log('Previous/current six-view sheet saved; same cameras, different browser environments.')
