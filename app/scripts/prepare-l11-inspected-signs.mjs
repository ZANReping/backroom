import {createCanvas,loadImage} from '@napi-rs/canvas'
import {writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const app=fileURLToPath(new URL('../',import.meta.url)),assets=path.join(app,'assets/l11-reference-signs-v2')
// Crop only the generated margins; never redraw letters or invent source text.
const specs=[
  {id:'pegasus',metres:[2.3,14],size:[384,2048],text:['PEGASUS','Apartment Residences','866 997 9310'],origin:'exec-be49ff83-650d-4391-bdb6-1457504fb720.png',mask:(r,g,b,a)=>a>200&&r>100&&r>g*1.45&&g>b*1.3},
  {id:'hope',metres:[1.25,.44],size:[1024,360],text:['Hope'],origin:'exec-97b88c05-cab5-4f50-b2d5-4dabdd8c03b8.png',mask:(r,g,b,a)=>a>200&&b>90&&b>r*1.5&&b>g*1.35,pad:12},
  {id:'famima',metres:[2.8,.58],size:[1024,212],text:['Famima!!'],origin:'exec-700f6e3d-c409-41a3-9f1d-5747792eed48.png',mask:(r,g,b,a)=>a>200&&Math.max(r,g,b)<65},
  {id:'famima-round',metres:[.68,.68],size:[512,512],text:['Famima!!'],origin:'exec-e848d633-88bc-40e0-9cad-fe77678cdf11.png',mask:(r,g,b,a)=>a>32},
]
const records=[]
for(const spec of specs){
  const img=await loadImage(path.join(assets,spec.id+'-source.png')),c=createCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0)
  const rgba=ctx.getImageData(0,0,img.width,img.height).data
  let x0=img.width,y0=img.height,x1=0,y1=0
  for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;if(spec.mask(...rgba.slice(i,i+4))){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}}
  const pad=spec.pad??0;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(img.width-1,x1+pad);y1=Math.min(img.height-1,y1+pad)
  const crop=[x0,y0,x1-x0+1,y1-y0+1],files=[]
  for(const [suffix,k] of [['',1],['_low',.5]]){
    const w=Math.round(spec.size[0]*k),h=Math.round(spec.size[1]*k),out=createCanvas(w,h),g=out.getContext('2d'),stem='l11-inspected-'+spec.id+suffix
    g.drawImage(img,...crop,0,0,w,h)
    for(const [channel,color]of [['',null],['_normal','#8080ff'],['_roughness','#b9b9b9']]){
      if(color){g.clearRect(0,0,w,h);g.fillStyle=color;g.fillRect(0,0,w,h)}
      const file='public/textures/'+stem+channel+'.png';writeFileSync(path.join(app,file),out.toBuffer('image/png'));files.push(file)
    }
  }
  records.push({id:spec.id,author:'OpenAI image_gen, project-directed reference reconstruction',license:'AI-generated project asset; reproduced depicted signage; no CC0 claim',sourceURL:null,origin:spec.origin,source:spec.id+'-source.png',prompt:spec.id+'.prompt.txt',reference:'reference/L11/11iconic.jpg',crop,sourceSize:[img.width,img.height],worldMetres:spec.metres,text:spec.text,files,review:'Visible wording and reading direction inspected against source-pixel crops. Typeface/physical metres remain reconstruction estimates, not a survey. Illegible poster copy is deliberately not invented.'})
}
writeFileSync(path.join(assets,'manifest.json'),JSON.stringify({generator:'built-in image_gen',processing:'node scripts/prepare-l11-inspected-signs.mjs',changes:['crop generated margins only','resize to declared world aspect, high/low tiers; sRGB albedo; mipmapped in renderer','uniform OpenGL normal and roughness; no noise','retain source alpha for circular face'],records},null,2)+'\n')
console.log(JSON.stringify(records.map(({id,crop,files})=>({id,crop,files})),null,2))
