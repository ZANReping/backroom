import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
import {L1_REFERENCE_CASES} from '../src/game/world/l1ReferenceCases'
const app=resolve(fileURLToPath(new URL('../',import.meta.url))),iteration=process.env.L1_QA_ITERATION??'iteration-5';if(!/^iteration-\d+$/.test(iteration))throw Error('L1_QA_ITERATION must be iteration-N');const out=resolve(app,'reports/l1-remake',iteration,'reference-data.json')
const data=Object.fromEntries(L1_PHOTO_ANCHORS.map(a=>{const c=L1_REFERENCE_CASES[a.id];return[a.id,{anchor:a,camera:c?.camera??[a.x-a.centerX,a.y-a.centerY,a.z,a.yaw,a.pitch,a.fov],regions:c?.regions??[],landmarks:c?.landmarks??[],parallels:c?.parallels??[],module:c?.module??{},partitions:c?.partitions??[]}]}))
mkdirSync(resolve(app,'reports/l1-remake',iteration),{recursive:true});writeFileSync(out,JSON.stringify({version:4,cases:data},null,2)+'\n');console.log(JSON.stringify({out,cases:Object.keys(data).length}))
