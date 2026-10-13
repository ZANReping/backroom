// Reproducible reference/geometry measurements. No image registration or colour correction.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createCanvas,loadImage} from '@napi-rs/canvas'
import * as THREE from 'three'
import {projectReferenceParallel,projectReferencePoint} from './l1-reference-projection.mjs'
const app=resolve(fileURLToPath(new URL('../',import.meta.url))),iteration=process.env.L1_QA_ITERATION??'iteration-5';if(!/^iteration-\d+$/.test(iteration))throw Error('L1_QA_ITERATION must be iteration-N');const root=resolve(app,'reports/l1-remake',iteration)
const cases=JSON.parse(readFileSync(resolve(root,'reference-data.json'),'utf8')).cases,out=resolve(root,'comparison');mkdirSync(out,{recursive:true})
const requestedAnchors=process.env.L1_QA_ANCHORS===undefined?Object.keys(cases):process.env.L1_QA_ANCHORS.split(',').map(id=>id.trim()).filter(Boolean)
for(const id of requestedAnchors)if(!(id in cases))throw Error(`L1_QA_ANCHORS contains unknown id: ${id}`)
const poseFile=resolve(root,'final/actual-cameras.json'),actualPoses=existsSync(poseFile)?JSON.parse(readFileSync(poseFile,'utf8')):[]
const missing=[],landmarks=[],regions=[],parallels=[],pairs=[],statuses={}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4
function average(img,[u,v,w,h]){
 const sx=Math.floor(u*img.width),sy=Math.floor(v*img.height),sw=Math.max(1,Math.floor(w*img.width)),sh=Math.max(1,Math.floor(h*img.height))
 const c=createCanvas(sw,sh),g=c.getContext('2d');g.drawImage(img,sx,sy,sw,sh,0,0,sw,sh)
 const p=g.getImageData(0,0,sw,sh).data,s=[0,0,0];for(let i=0;i<p.length;i+=4)for(let j=0;j<3;j++)s[j]+=linear(p[i+j]);const rgb=s.map(v=>v/(sw*sh))
 return{rgb,luminance:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
}
function project(c,mark){
 const a=c.anchor,pose=actualPoses.find(p=>p.id===a.id),cam=new THREE.PerspectiveCamera(pose?.fov??a.fov,pose?.aspect??a.width/a.height,.01,1000)
 cam.position.fromArray(pose?.worldPosition??[a.x,1.55+a.z,a.y]);cam.rotation.order='YXZ';cam.rotation.set(...(pose?pose.rotation.slice(0,3):[a.pitch,a.yaw,a.roll??0]));cam.updateMatrixWorld()
 return projectReferencePoint(cam,mark,[a.centerX,0,a.centerY])
}
function projectParallel(c,line){
 const a=c.anchor,pose=actualPoses.find(p=>p.id===a.id),cam=new THREE.PerspectiveCamera(pose?.fov??a.fov,pose?.aspect??a.width/a.height,.01,1000)
 cam.position.fromArray(pose?.worldPosition??[a.x,1.55+a.z,a.y]);cam.rotation.order='YXZ';cam.rotation.set(...(pose?pose.rotation.slice(0,3):[a.pitch,a.yaw,a.roll??0]));cam.updateMatrixWorld()
 return projectReferenceParallel(cam,line)
}
for(const id of requestedAnchors){const c=cases[id]
 const source=resolve(app,'reference/L1',c.anchor.file),current=resolve(root,'final/reference',id+'.png')
 if(!existsSync(source)||!existsSync(current)){missing.push(id);statuses[id]={status:'unmeasured',reason:'missing image'};continue}
 const [si,ci]=await Promise.all([loadImage(source),loadImage(current)]),w=960,h=Math.round(w*si.height/si.width),can=createCanvas(w*3,h),g=can.getContext('2d')
 g.drawImage(si,0,0,w,h);g.drawImage(ci,w,0,w,h);g.drawImage(si,2*w,0,w,h);g.globalAlpha=.5;g.drawImage(ci,2*w,0,w,h);g.globalAlpha=1
 writeFileSync(resolve(out,id+'-compare.png'),can.toBuffer('image/png'));pairs.push({id,w,h})
 const rows=c.landmarks.map(l=>{const p=project(c,l),delta=p.uv.map((v,i)=>(v-l.image[i])*100);return{id,landmark:l.id,kind:l.kind,world:l.world,profile:l.profile,sourceUV:l.image,projectedUV:p.uv,inFrame:p.inFrame,dxPercent:delta[0],dyPercent:delta[1],maxPercent:Math.max(...delta.map(Math.abs)),within3:p.inFrame&&delta.every(v=>Math.abs(v)<=3)}})
 for(const line of c.parallels??[]){const p=projectParallel(c,line);parallels.push({id,line:line.id,axis:line.axis,sourceFrom:line.from,sourceTo:line.to,angleDegrees:p.angleDegrees,endpointErrorPercent:p.endpointError*100,vanishingPoint:p.vanishingPoint})}
 landmarks.push(...rows);statuses[id]={status:rows.length?'measured':'unmeasured',points:rows.length,within3:rows.filter(r=>r.within3).length,allWithin3:rows.length>0&&rows.every(r=>r.within3)}
 for(const r of c.regions){const a=average(si,r.rect),b=average(ci,r.rect);regions.push({id,name:r.name,rect:r.rect,source:a,current:b,deltaLuminance:b.luminance-a.luminance})}
}
for(let p=0;p<pairs.length;p+=6){
 const page=createCanvas(960,1440),g=page.getContext('2d');g.fillStyle='#14181b';g.fillRect(0,0,960,1440)
 for(let i=0;i<6&&p+i<pairs.length;i++){
  const a=pairs[p+i],im=await loadImage(resolve(out,a.id+'-compare.png')),y=i*240
  g.fillStyle='#ddd';g.font='14px sans-serif';g.fillText(a.id+'     reference',8,y+19);g.fillText('game',328,y+19);g.fillText('50% overlay',648,y+19)
  const k=Math.min(320/a.w,212/a.h),dw=a.w*k,dh=a.h*k
  for(let j=0;j<3;j++)g.drawImage(im,j*a.w,0,a.w,a.h,j*320+(320-dw)/2,y+26+(212-dh)/2,dw,dh)
 }
 writeFileSync(resolve(out,`thumbnails-${p/6+1}.png`),page.toBuffer('image/png'))
}
writeFileSync(resolve(out,'landmark-errors.json'),JSON.stringify({method:'Manual source points (~1% annotation uncertainty), unregistered geometric projection; visibility correspondence still requires image review.',scope:requestedAnchors,missing,cases:statuses,landmarks},null,2)+'\n')
writeFileSync(resolve(out,'landmark-errors.csv'),['case,landmark,sourceU,sourceV,projectedU,projectedV,dxPercent,dyPercent,maxPercent,inFrame,within3',...landmarks.map(r=>[r.id,r.landmark,...r.sourceUV,...r.projectedUV,r.dxPercent,r.dyPercent,r.maxPercent,r.inFrame,r.within3].join(','))].join('\n')+'\n')
writeFileSync(resolve(out,'region-errors.json'),JSON.stringify({method:'Mean linear sRGB luminance, same normalized image rectangles; not an absolute lux measurement.',regions},null,2)+'\n')
writeFileSync(resolve(out,'parallel-errors.json'),JSON.stringify({scope:requestedAnchors,method:'Manual source parallel lines, camera direction only; not full visual acceptance',rows:parallels},null,2)+'\n')
writeFileSync(resolve(out,'missing.json'),JSON.stringify(missing,null,2)+'\n')
console.log(JSON.stringify({pairs:pairs.length,missing,landmarks:landmarks.length,within3:landmarks.filter(r=>r.within3).length}))
