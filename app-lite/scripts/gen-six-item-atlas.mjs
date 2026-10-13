// Original procedural artwork; deterministic seed. No network or runtime canvas work.
import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../public/textures/items-six/', import.meta.url))
mkdirSync(output, { recursive: true })
const size = 1024, tile = 256, pad = 8
const color = createCanvas(size, size), ctx = color.getContext('2d')
const relief = new Float32Array(size * size), rough = new Uint8Array(size * size)
const names = ['milkLabel', 'glass', 'cork', 'lightning', 'brass', 'brassEdge', 'fur', 'capMetal', 'opal', 'silver', 'jade', 'cord', 'milkCap', 'milk', 'backing', 'ivory']
const bases = [[219,218,196],[197,216,211],[145,107,65],[159,216,250],[142,113,62],[190,160,95],[160,146,123],[127,122,104],[115,157,163],[159,166,161],[86,108,59],[100,42,35],[184,187,175],[228,222,199],[75,79,72],[236,231,209]]
const noise = (x,y,k=0) => { let h=Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^Math.imul(k+7,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295 }
const mix = (a,b,t) => a*(1-t)+b*t
const smooth = (x,y,k) => {const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,a=u*u*(3-2*u),b=v*v*(3-2*v);return mix(mix(noise(ix,iy,k),noise(ix+1,iy,k),a),mix(noise(ix,iy+1,k),noise(ix+1,iy+1,k),a),b)}
// Engraved leaf veins, in the same planar coordinates as the brooch's silver leaves.
const veins=[[[.03,.004],[.055,.002],[.083,-.006],[.117,-.023],[.153,-.033],[.164,-.03]],
  [[.043,.004],[.039,.022],[.045,.039]],[[.062,0],[.058,.018],[.069,.027]],
  [[.086,-.008],[.083,.009],[.094,.019]],[[.114,-.022],[.11,-.006],[.124,0]],
  [[.071,-.003],[.064,-.008],[.05,-.009]],[[.107,-.018],[.098,-.025],[.09,-.02]],[[.142,-.03],[.133,-.036],[.119,-.034]]]
const segmentDistance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}
const veinDistance=(x,y)=>Math.min(...veins.flatMap(path=>path.slice(1).map((b,i)=>segmentDistance(x,y,path[i],b))))
for (let id=0;id<16;id++) {
  const tx=id%4*tile, ty=Math.floor(id/4)*tile, img=ctx.createImageData(tile,tile)
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++) {
    const u=Math.max(pad,Math.min(tile-pad-1,x)),v=Math.max(pad,Math.min(tile-pad-1,y)),n=noise(u,v,id)
    const cloud=(Math.sin(u*.039+Math.sin(v*.047)*2)+Math.sin(v*.023+u*.019)+Math.cos(v*.075-u*.05))/3
    let c=[...bases[id]],h=0,r=180,shade=(n-.5)*8
    if(id===1){shade=(n-.5)*3;r=48;h=(noise(u,Math.floor(v/12),1)>.997?-.1:0)}
    if(id===2){const pore=noise(Math.floor(u/3),Math.floor(v/2),4);shade=cloud*15+(pore>.83?-38:0)+(n-.5)*18;h=shade/90;r=223}
    if(id===3){const core=Math.exp(-(((u-128)/33)**2));c=[mix(41,241,core),mix(123,251,core),255];r=70}
    if(id===4||id===5||id===7||id===9||id===12||id===14){shade=(noise(u,Math.floor(v/2),id)-.5)*16+cloud*10;r=id===5?75:120;h=(n-.5)*.035;if(noise(Math.floor(u/2),Math.floor(v/35),id)>.96){shade-=22;h-=.07;r+=45}}
    if(id===6){const strand=smooth(u*.7+Math.sin(v*.03)*.7,v*.028,43)-.5;shade=strand*33+cloud*12+(n-.5)*12;h=strand*.07;r=236;const tip=v/255;c=c.map(a=>a+tip*12)}
    if(id===8){const fleck=smooth(u*.23,v*.26,13),body=smooth(u*.027,v*.032,9),green=smooth(u*.017,v*.022,3),fire=Math.max(0,(fleck-.53)*2.1);c=[8+fire*160,70+body*100+fire*130,137+body*100];if(green>.52){c=[25+fire*185,166+fire*89,60+(1-green)*85]}shade=(n-.5)*10;r=69;h=cloud*.002}
    if(id===9){const x=(u-8)/240*.19,y=(1-(v-8)/240)*.14-.07,d=veinDistance(x,y),groove=Math.exp(-((d/.0008)**2)),edge=Math.exp(-(((d-.0011)/.0005)**2));shade=(n-.5)*4-groove*83+edge*28+cloud*4;c=[164,180,186];h=-groove*.45;r=65+groove*75}
    if(id===10){const vein=Math.max(0,smooth(u*.035,v*.042,12)-.4),mottle=smooth(u*.14,v*.17,32);c=[65+vein*65+mottle*9,85+vein*73+mottle*12,43+vein*43+mottle*8];shade=(n-.5)*3;r=116+cloud*12;h=cloud*.004}
    if(id===11){const braid=Math.sin(u*.45+v*.30)*Math.sin(u*.45-v*.30);shade=braid*15+(n-.5)*8;h=braid*.14;r=224}
    if(id===13||id===15){shade=(n-.5)*2;r=205}
    const dst=(y*tile+x)*4, global=(ty+y)*size+tx+x
    for(let k=0;k<3;k++)img.data[dst+k]=Math.max(0,Math.min(255,c[k]+shade))
    img.data[dst+3]=255;relief[global]=h;rough[global]=r
  }
  ctx.putImageData(img,tx,ty)
}
// Label occupies the whole cylindrical band; center is +Z, seam on -Z.
ctx.save();ctx.translate(0,0)
ctx.fillStyle='#dedcc5';ctx.fillRect(8,8,240,240)
// Unwrapped band is 4.7 times wider than tall in metres: pre-compensate type.
ctx.translate(128,0);ctx.scale(.23,1);ctx.translate(-128,0)
ctx.strokeStyle='#6d775a';ctx.lineWidth=2;ctx.strokeRect(-18,15,292,226)
ctx.fillStyle='#283b27';ctx.strokeStyle='#283b27';ctx.lineWidth=1.8;ctx.textAlign='center';ctx.font='bold 30px Arial';ctx.fillText('LUCKY O’',128,62);ctx.strokeText('LUCKY O’',128,62)
ctx.font='bold 43px Arial';ctx.fillText('MILK',128,107);ctx.strokeText('MILK',128,107)
ctx.font='12px Arial';ctx.fillText('PLAIN · SOY DRINK',128,124)
ctx.strokeStyle='#92967a';ctx.beginPath();ctx.moveTo(36,137);ctx.lineTo(220,137);ctx.stroke()
ctx.font='11px Arial';ctx.fillText('HIGH IN CALCIUM',128,165);ctx.fillText('590 ml',128,203);ctx.restore()
// A separate side/back ingredients panel; the front remains legible at hand distance.
ctx.save();ctx.translate(39,0);ctx.scale(.23,1);ctx.fillStyle='#3f503a';ctx.textAlign='center';ctx.font='bold 14px Arial';ctx.fillText('INGREDIENTS',0,54)
ctx.font='11px Arial';for(const [i,line]of ['SOYBEANS 100%','SUGARS 0%','NATURAL PRESERVATIVES 300%','ARTIFICIAL COLOURS 0%'].entries())ctx.fillText(line,0,87+i*29);ctx.restore()
// Fine stamped cap rings and key engravings are paint, not separate meshes.
for(const id of [4,5,7,12]){const x=id%4*tile,y=Math.floor(id/4)*tile;ctx.save();ctx.translate(x,y);ctx.strokeStyle='rgba(38,35,24,.28)';ctx.lineWidth=1;for(let i=28;i<236;i+=12){ctx.beginPath();ctx.moveTo(18,i);ctx.lineTo(238,i);ctx.stroke()}ctx.restore()}
// Extend the tile edge artwork into padding before creating mipmaps.
for(let id=0;id<16;id++){const x=id%4*tile,y=Math.floor(id/4)*tile;ctx.drawImage(color,x+pad,y+pad,1,240,x,y+pad,pad,240);ctx.drawImage(color,x+247,y+pad,1,240,x+248,y+pad,pad,240);ctx.drawImage(color,x,y+pad,256,1,x,y,256,pad);ctx.drawImage(color,x,y+247,256,1,x,y+248,256,pad)}
const normal=createCanvas(512,512),roughness=createCanvas(512,512),nc=normal.getContext('2d'),rc=roughness.getContext('2d'),ni=nc.createImageData(512,512),ri=rc.createImageData(512,512)
for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const sx=x*2,sy=y*2,tx=Math.floor(sx/256)*256,ty=Math.floor(sy/256)*256
  const sample=(px,py)=>relief[Math.max(ty+8,Math.min(ty+247,py))*1024+Math.max(tx+8,Math.min(tx+247,px))]
  const dx=(sample(sx+2,sy)-sample(sx-2,sy))*.7,dy=(sample(sx,sy+2)-sample(sx,sy-2))*.7,len=Math.hypot(dx,dy,1),o=(y*512+x)*4
  ni.data[o]=(-dx/len*.5+.5)*255;ni.data[o+1]=(dy/len*.5+.5)*255;ni.data[o+2]=(1/len*.5+.5)*255;ni.data[o+3]=255
  ri.data[o]=ri.data[o+1]=ri.data[o+2]=rough[sy*size+sx];ri.data[o+3]=255
}
nc.putImageData(ni,0,0);rc.putImageData(ri,0,0)
writeFileSync(`${output}/color.png`,color.toBuffer('image/png'));writeFileSync(`${output}/normal.png`,normal.toBuffer('image/png'));writeFileSync(`${output}/roughness.png`,roughness.toBuffer('image/png'))
writeFileSync(`${output}/layout.json`,JSON.stringify({size,padding:pad,tiles:Object.fromEntries(names.map((name,i)=>[name,[i%4*256,Math.floor(i/4)*256,256,256]]))},null,2)+'\n')
console.log('Generated six-item color 1024², OpenGL normal 512², roughness 512² atlases')
