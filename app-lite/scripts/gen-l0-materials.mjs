// Reproducible PBR preparation: CC0 bases first, reference-reviewed imagegen wallpapers.
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=new URL('../public/textures/l0-remake/',import.meta.url);mkdirSync(dir,{recursive:true});
const sources={
 wall:['../assets/l0-materials/wall-v4.png',null,[190,188,124]],
 dots:['../public/textures/l4/white_plaster_02_Color.jpg',null,[190,188,124]],
 manila:['../assets/l0-materials/manila-v2.png',null,[210,198,172]],
 'manila-ceiling':['../public/textures/l4/white_plaster_02_Color.jpg',null,[168,155,130]],
 diffuser:['../public/textures/l4/white_plaster_02_Color.jpg','../public/textures/l4/white_plaster_02',[239,237,222]],
 'door-wood':['../public/textures/l5/wood_floor_Color.jpg',null,[118,87,57]],
 carpet:['../public/textures/l4/dirty_carpet_Color.jpg','../public/textures/l4/dirty_carpet',[139,130,91]],
 'arch-carpet':['../public/textures/l4/dirty_carpet_Color.jpg','../public/textures/l4/dirty_carpet',[153,137,106]],
 wood:['../public/textures/l5/wood_floor_Color.jpg','../public/textures/l5/wood_floor',[115,78,43]],
 cream:['../public/textures/l4/white_plaster_02_Color.jpg','../public/textures/l4/white_plaster_02',[201,195,177]],
 ceiling:['../public/textures/l4/white_plaster_02_Color.jpg',null,[192,180,132]],
 red:['../assets/l0-materials/wall-v4.png',null,[133,35,28]],
 'red-carpet':['../public/textures/l4/dirty_carpet_Color.jpg','../public/textures/l4/dirty_carpet',[98,31,25]],
 'red-ceiling':['../public/textures/l4/white_plaster_02_Color.jpg',null,[106,33,27]],
 pit:['../public/textures/l4/white_plaster_02_Color.jpg','../public/textures/l4/white_plaster_02',[100,91,64]],
};
const manifest=[];
for(const [kind,[path,pbr,target]]of Object.entries(sources)){
 const c=createCanvas(1024,1024),g=c.getContext('2d'),image=await loadImage(fileURLToPath(new URL(path,import.meta.url))),repeat=kind.includes('carpet')?6:1;
 if(kind==='door-wood')for(let x=0;x<4;x++)g.drawImage(image,12,5,88,910,x*256,0,256,1024);
 else for(let y=0;y<repeat;y++)for(let x=0;x<repeat;x++)g.drawImage(image,x*1024/repeat,y*1024/repeat,1024/repeat,1024/repeat);
 const im=g.getImageData(0,0,1024,1024),avg=[0,0,0];for(let i=0;i<im.data.length;i+=4)for(let k=0;k<3;k++)avg[k]+=im.data[i+k]/1048576;
 for(let i=0;i<im.data.length;i+=4)for(let k=0;k<3;k++)im.data[i+k]=target[k]+(im.data[i+k]-avg[k])*(kind==='diffuser'?.035:kind==='cream'?.12:kind.endsWith('ceiling')?.12:kind.includes('carpet')?.23:kind==='door-wood'?.25:kind==='manila'?.8:kind==='wood'?.85:.7);
 if(kind.includes('carpet')){
  // Preserve the scanned fibre scale; use a separate CC0 scan at low frequency
  // for broad wear rather than enlarging individual loops into pebble shapes.
  const macro=createCanvas(24,24),mg=macro.getContext('2d');mg.drawImage(await loadImage(fileURLToPath(new URL('../public/textures/l4/white_plaster_02_Color.jpg',import.meta.url))),0,0,24,24);
  const mc=createCanvas(1024,1024),ctx=mc.getContext('2d');ctx.drawImage(macro,0,0,1024,1024);const pixels=ctx.getImageData(0,0,1024,1024).data;
  let mean=0;for(let i=0;i<pixels.length;i+=4)mean+=pixels[i]/1048576;
  const wearAmplitude=kind==='arch-carpet'?.18:(kind==='carpet'||kind==='red-carpet')?.10:.18;
  for(let i=0;i<im.data.length;i+=4)for(let k=0;k<3;k++)im.data[i+k]+=(pixels[i]-mean)*wearAmplitude;
 }
 // Periodic edge conditioning; keep both edge samples identical for mipmaps.
 if(!pbr)for(let a=0;a<1024;a++)for(let d=0;d<20;d++)for(let k=0;k<3;k++){
  const pairs=[[(a*1024+d)*4+k,(a*1024+1023-d)*4+k],[(d*1024+a)*4+k,((1023-d)*1024+a)*4+k]];
  for(const [i,j]of pairs){const m=(im.data[i]+im.data[j])/2,t=(20-d)/20;im.data[i]=im.data[i]*(1-t)+m*t;im.data[j]=im.data[j]*(1-t)+m*t;}
 }
 g.putImageData(im,0,0);
 if(kind==='dots'){g.fillStyle='#7b7c5277';for(let y=0;y<1024;y+=52)for(let x=0;x<1024;x+=44){g.fillRect(x+((y/52)%2)*22,y,3,5)}}
 if(kind==='ceiling'||kind==='red-ceiling'){g.fillStyle=kind==='ceiling'?'#9b998b':'#511712';g.fillRect(0,0,1024,5);g.fillRect(0,0,5,1024);}
 writeFileSync(new URL(kind+'.png',dir),c.toBuffer('image/png'));
 const small=createCanvas(512,512),s=small.getContext('2d');s.drawImage(c,0,0,512,512);
 const src=s.getImageData(0,0,512,512),normal=s.createImageData(512,512),rough=s.createImageData(512,512);
 const height=(x,y)=>src.data[(((y+512)%512)*512+(x+512)%512)*4]/255;
 const normalScale=kind==='diffuser'?.045:.45;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,dx=(height(x-1,y)-height(x+1,y))*normalScale,dy=(height(x,y+1)-height(x,y-1))*normalScale,n=Math.hypot(dx,dy,1);normal.data.set([128+127*dx/n,128+127*dy/n,128+127/n,255],i);const r=kind==='diffuser'?190:kind==='wood'?Math.max(215,188):kind.includes('carpet')?Math.max(245,240):226;rough.data.set([r,r,r,255],i)}
 for(const [name,data,suffix]of [['normal',normal,'NormalGL'],['rough',rough,'Roughness']]){
  s.putImageData(data,0,0);if(pbr){const image=await loadImage(fileURLToPath(new URL(pbr+'_'+suffix+'.jpg',import.meta.url)));for(let y=0;y<repeat;y++)for(let x=0;x<repeat;x++)s.drawImage(image,x*512/repeat,y*512/repeat,512/repeat,512/repeat)}
  writeFileSync(new URL(kind+'-'+name+'.png',dir),small.toBuffer('image/png'));
 }
 const macroSource='../public/textures/l4/white_plaster_02_Color.jpg';
 manifest.push({material:kind,source:path,sourceSHA256:createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex'),repeat,horizontalRepeats:kind==='door-wood'?4:repeat,crop:kind==='door-wood'?[12,5,88,910]:undefined,secondarySources:(kind==='carpet'||kind==='arch-carpet'||kind==='red-carpet')?[{source:macroSource,sourceSHA256:createHash('sha256').update(readFileSync(new URL(macroSource,import.meta.url))).digest('hex'),purpose:'24px broad wear, amplitude '+(kind==='arch-carpet'?'.18':'.10')}]:undefined,color:1024,normal:512,roughness:512,normalConvention:'OpenGL +Y'});
}
writeFileSync(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${manifest.length} L0 materials: CC0 scanned surfaces and reference-reviewed generated wallpapers.`);
