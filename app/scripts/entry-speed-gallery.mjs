import fs from 'node:fs'
import path from 'node:path'
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas'
const root=path.resolve(import.meta.dirname,'../reports/entry-speed-20261029')
GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc','QA Sans')
const runtime=JSON.parse(fs.readFileSync(path.join(root,'validated-cold-realistic/runtime.json'),'utf8'))
const selected=[0,1,4,5,7,8,9,11,101,102,900,902]
async function sheet(label,rows,columns,width,name){
 const imageH=width*9/16,tileH=imageH+32,c=createCanvas(columns*width,Math.ceil(rows.length/columns)*tileH+46),ctx=c.getContext('2d')
 ctx.fillStyle='#151a21';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#f0f4f5';ctx.font='20px "QA Sans"';ctx.fillText(label,14,30)
 for(let i=0;i<rows.length;i++){
  const row=rows[i],x=(i%columns)*width,y=46+Math.floor(i/columns)*tileH
  const image=await loadImage(path.join(root,row.file));ctx.drawImage(image,x,y,width,imageH);ctx.fillStyle='#e6ecef';ctx.font='15px "QA Sans"';ctx.fillText(row.label,x+9,y+imageH+22,width-18)
 }
 fs.writeFileSync(path.join(root,name),c.toBuffer('image/png'))
}
await sheet('31 个注册入口｜真实光影｜首次场景就绪后的实际截图',runtime.cases.map(row=>({file:'validated-cold-realistic/'+row.id+'.png',label:row.name+' · '+(row.loadMs/1000).toFixed(2)+' s'})),5,384,'all-entry-contact.png')
if(fs.existsSync(path.join(root,'final-priority-app-realistic/app-902.png'))){
 const app=JSON.parse(fs.readFileSync(path.join(root,'final-priority-app-realistic/runtime.json'),'utf8'))
 await sheet('真实 App 过场结束｜HUD、场景及键盘移动验证',selected.map(id=>({file:'final-priority-app-realistic/app-'+id+'.png',label:runtime.cases.find(c=>c.id===id).name+' · '+(app.appLevels.entries.find(c=>c.id===id).playableMs/1000).toFixed(2)+' s'})),4,480,'app-contact.png')
}
const compare=[]
for(const label of ['baseline-realistic','validated-cold-realistic'])for(const id of [1,5,102,900])compare.push({file:label+'/'+id+'.png',label:(label==='baseline-realistic'?'原始':'优化后')+' · '+runtime.cases.find(c=>c.id===id).name})
await sheet('同种子 424242、同机位的实际场景对照｜未减少近处建筑和材质',compare,4,480,'before-after-scenes.png')
console.log('Saved actual-game contact sheets')
