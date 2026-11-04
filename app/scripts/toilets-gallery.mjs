import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas'
import {writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const out=fileURLToPath(new URL('../reports/toilets-20261030/',import.meta.url))
GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc','QA Chinese')
const cases=[['l02','L0.2'],['foyer','前厅'],['l4','Level 4'],['stone','L8 石马桶'],['l9','Level 9'],['l11','Level 11'],['traders','商人之家'],['latrine','L10 旱厕']]
const w=480,h=270,header=44,label=30,c=createCanvas(w*4,header+(h+label)*4),g=c.getContext('2d');g.fillStyle='#182226';g.fillRect(0,0,c.width,c.height);g.fillStyle='#e5ebeb';g.font='22px "QA Chinese"';g.fillText('马桶模型对照：每组左侧修复前，右侧修复后（游戏原始工厂／材质）',18,29)
for(let i=0;i<cases.length;i++){const[id,labelText]=cases[i],pair=i%2,row=Math.floor(i/2);for(let after=0;after<2;after++){const folder=id==='traders'?(after?'traders-realistic':'traders-before'):(after?'final-realistic':'before-realistic'),img=await loadImage(path.join(out,folder,'gallery'+id+'.png')),x=(pair*2+after)*w,y=header+row*(h+label);g.drawImage(img,x,y,w,h);g.fillStyle='#e5ebeb';g.font='18px "QA Chinese"';g.fillText(labelText+' · '+(after?'修复后':'修复前'),x+10,y+h+22)}}
writeFileSync(path.join(out,'comparison.png'),c.toBuffer('image/png'));console.log(path.join(out,'comparison.png'))
