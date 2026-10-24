import * as THREE from 'three'
export function mountFixes(api:any) {
  const e=api.engine
  return {
    doorView(){Object.assign(e.player,{x:6.35,y:16.9,z:0,vz:0,crouching:false});Object.assign(api.look,{yaw:-Math.PI/2,pitch:-.1})},
    doorState(){
      const r=api.renderer(),ray=new THREE.Raycaster(new THREE.Vector3(6.35,1.3,16.9),new THREE.Vector3(1,0,0)),hit=ray.intersectObject(r.foyer.group,true)[0]
      return{indoor:r.foyerIndoor,home:r.foyer.group.visible,street:r.foyerStreet.group.visible,firstMaterial:(hit?.object as THREE.Mesh)?.material instanceof THREE.Material?((hit.object as THREE.Mesh).material as THREE.Material).name:null,at:hit?.point.toArray()}
    },
    posterView(){Object.assign(e.player,{x:52.6,y:57.8,z:0,vz:0,crouching:false});Object.assign(api.look,{yaw:Math.PI,pitch:0})},
    noticeState(){const d=document.querySelector('[data-missing-notice]') as HTMLElement|null;if(!d)return null;const r=d.getBoundingClientRect(),button=d.querySelector('button')!.getBoundingClientRect();return{heading:d.querySelector('h2')?.textContent,animation:getComputedStyle(d).animationName,role:d.getAttribute('role'),focused:document.activeElement===d,viewport:[innerWidth,innerHeight],bounds:[r.x,r.y,r.width,r.height],button:[button.x,button.y,button.width,button.height],overflow:document.documentElement.scrollWidth>innerWidth,read:!!e.player.prologue.flags.read_poster}},
  }
}
