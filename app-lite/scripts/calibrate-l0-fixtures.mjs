// Project manually marked reference pixels onto the real ceiling. Suggestions
// require visibility/clearance review before entering the production layout.
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
const tag=process.argv[2]??'';
if(tag&&!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid report tag');
const anchors=JSON.parse(readFileSync(new URL(`../reports/l0-remake/${tag?tag+'/':''}after-anchors.json`,import.meta.url),'utf8'));
const points={yellow:[[236,37,93],[287,70,65],[309,84,45],[328,97,41]],arch:[[270,11,98],[228,43,76],[199,59,61],[144,67,54]],pillars:[[160,121,70],[155,148,40],[153,160,30],[150,171,20]],pits:[[198,145,68],[245,168,46],[269,180,32],[286,188,29],[487,163,65],[426,179,25]],'red-lost':[[160,0,55],[195,44,48],[217,74,34],[232,94,28]]};
const suggestions=[];
for(const [id,pixels]of Object.entries(points)){
 const a=anchors.find(v=>v.pose.id===id);if(!a)continue;
 const c=new THREE.PerspectiveCamera(a.actualCamera.fov,a.width/a.height,.05,100);c.position.copy(a.actualCamera.position);c.rotation.order='YXZ';c.rotation.set(a.actualCamera.rotation.x,a.actualCamera.rotation.y,a.actualCamera.rotation.z);c.updateMatrixWorld();
 const ray=(x,y)=>{const d=new THREE.Vector3(x/a.width*2-1,1-y/a.height*2,.5).unproject(c).sub(c.position).normalize();if(d.y<=0)throw Error(`${id}: pixel ray does not reach the ceiling`);return c.position.clone().addScaledVector(d,(2.675-c.position.y)/d.y)};
 suggestions.push({id,ceiling:2.675,fixtures:pixels.map(([x,y,w])=>{const p=ray(x,y);return{pixel:[x,y,w],x:+p.x.toFixed(3),y:+p.z.toFixed(3),width:+ray(x-w/2,y).distanceTo(ray(x+w/2,y)).toFixed(3)}})});
}
console.log(JSON.stringify(suggestions,null,2));
