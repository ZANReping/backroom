// Offline evidence assembly. Browser captures are produced by verify-l1-detail-runtime.mjs.
import {createCanvas,loadImage} from '@napi-rs/canvas'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,sep} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=new URL('../',import.meta.url)
const reportRoot=resolve(fileURLToPath(new URL('reports/l1-remake/',root)),process.argv[2]??'.')
const reportBase=resolve(fileURLToPath(new URL('reports/l1-remake/',root)))
if(reportRoot!==reportBase&&!reportRoot.startsWith(reportBase+sep))throw new Error('Report root must remain inside app/reports/l1-remake')
const base=pathToFileURL(reportRoot+sep)
const cameras=JSON.parse(readFileSync(new URL('current/cameras.json',base),'utf8'))
mkdirSync(new URL('comparison/',base),{recursive:true})
for(let page=0;page<3;page++){
 const sheet=createCanvas(1440,960),ctx=sheet.getContext('2d');ctx.fillStyle='#15191b';ctx.fillRect(0,0,1440,960)
 for(let j=0;j<6;j++){
  const a=cameras[page*6+j],ref=await loadImage(fileURLToPath(new URL('reference/L1/'+a.file,root))),now=await loadImage(fileURLToPath(new URL('current/reference/'+a.id+'.png',base)))
  const x=(j%2)*720,y=Math.floor(j/2)*320
  ctx.fillStyle='#fff';ctx.font='15px sans-serif';ctx.fillText(a.id+'   reference | game',x+10,y+20)
  for(const [img,xx] of [[ref,x],[now,x+360]]){const s=Math.min(350/img.width,284/img.height);ctx.drawImage(img,xx+(360-img.width*s)/2,y+30,img.width*s,img.height*s)}
  const overlay=createCanvas(640,Math.round(640*ref.height/ref.width)),c=overlay.getContext('2d')
  c.drawImage(ref,0,0,overlay.width,overlay.height);c.globalAlpha=.5;c.drawImage(now,0,0,overlay.width,overlay.height)
  writeFileSync(new URL('comparison/'+a.id+'-overlay.jpg',base),overlay.toBuffer('image/jpeg'))
 }
 writeFileSync(new URL('comparison/sheet-'+(page+1)+'.jpg',base),sheet.toBuffer('image/jpeg'))
}
const normalCamerasPath=new URL('current/normal-cameras.json',base)
if(existsSync(fileURLToPath(normalCamerasPath))){
 const normalCameras=JSON.parse(readFileSync(normalCamerasPath,'utf8')).slice(0,6)
 const sheet=createCanvas(1280,1200),ctx=sheet.getContext('2d');ctx.fillStyle='#15191b';ctx.fillRect(0,0,1280,1200);ctx.font='15px sans-serif'
 for(const [i,a] of normalCameras.entries()){
  const x=(i%2)*640,y=Math.floor(i/2)*400
  ctx.fillStyle='#000';ctx.fillRect(x,y,640,400);ctx.fillStyle='#fff';ctx.fillText(`seed ${a.seed}  x/y ${a.x}/${a.y}  yaw ${a.yaw}`,x+10,y+24)
  const img=await loadImage(fileURLToPath(new URL('current/normal/'+a.id+'.png',base))),s=Math.min(620/img.width,350/img.height)
  ctx.drawImage(img,x+(640-img.width*s)/2,y+40,img.width*s,img.height*s)
 }
 writeFileSync(new URL('comparison/normal-sheet.jpg',base),sheet.toBuffer('image/jpeg'))
}
console.log('18 reference/game comparisons and overlays saved. No geometric alignment score is implied.')
