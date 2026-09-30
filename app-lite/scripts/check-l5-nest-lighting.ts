import assert from 'node:assert/strict'
import * as THREE from 'three'
import { L5NestLighting } from '../src/game/renderer/l5NestLighting'
import { l5NestLayout } from '../src/game/world/infiniteL5'
import type { GameMap } from '../src/game/world/mapgen'

const layout=l5NestLayout(424242,-1,-6);assert(layout,'known nest layout missing')
const door={kind:'hoteldoor',x:layout.doorX,y:layout.doorY,w:1,h:1,solid:true,data:{mothNest:'-1,-6',open:0}} as any
const map={inf:{seed:424242,ox:0,oy:0,rev:1},structures:[door]} as unknown as GameMap
const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld()
const animated=new Map<any,THREE.Group>();const leaf=new THREE.Group();leaf.userData.open=.5;animated.set(door,leaf)
const lighting=new L5NestLighting();lighting.update(map,5,3.3,camera,animated)
assert.equal(lighting.uniforms.l5NestCount.value,1)
const b=lighting.uniforms.l5NestBounds.value[0],d=lighting.uniforms.l5NestDoors.value[0]
assert.deepEqual([b.x,b.y,b.z,b.w],[layout.x0,layout.y0,layout.doorX+.5,layout.y1+1])
assert(Math.abs(d.y-Math.sin(.775))<1e-6&&Math.abs(d.z-Math.cos(.775))<1e-6&&d.w===.5,'animated door parameters mismatch')
map.inf!.ox=17;map.inf!.oy=-9;map.inf!.rev=2;lighting.update(map,5,3.3,camera,animated)
assert.equal(lighting.uniforms.l5NestBounds.value[0].x,layout.x0-17);assert.equal(lighting.uniforms.l5NestDoors.value[0].x,layout.doorY+.5+9)
lighting.update(map,4,3.3,camera,animated);assert.equal(lighting.uniforms.l5NestCount.value,0)
lighting.update(map,5,3.3,camera,animated,true);assert.equal(lighting.uniforms.l5NestCount.value,0)
camera.position.set(layout.doorX-1-map.inf!.ox,1.55,layout.doorY+.5-map.inf!.oy)
lighting.update(map,5,3.3,camera,animated);assert.equal(lighting.uniforms.l5PlayerNest.value,0)
camera.position.x=layout.doorX+1-map.inf!.ox
lighting.update(map,5,3.3,camera,animated);assert.equal(lighting.uniforms.l5PlayerNest.value,-1)

function checkMaterial(material:THREE.Material){
  let originalCalls=0;const original=material.onBeforeCompile;material.onBeforeCompile=(shader)=>{originalCalls++;shader.uniforms.originalTest={value:7};shader.fragmentShader+='\noriginal-test-marker';original(shader,{ } as any)};material.customProgramCacheKey=()=> 'original-test-key'
  const lighting2=new L5NestLighting();lighting2.patch(material);const patched=material.onBeforeCompile;assert.notEqual(patched,original);lighting2.patch(material);assert.equal(material.onBeforeCompile,patched);assert.equal(material.customProgramCacheKey(),'original-test-key|l5-nest-light-v3')
  const vertex='void main(){gl_Position=vec4(0.0);}',shader:any={uniforms:{},vertexShader:vertex,fragmentShader:'#include <common>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n#include <fog_fragment>'};patched(shader,{} as any)
  assert.equal(originalCalls,1);assert.equal(shader.uniforms.originalTest.value,7);assert(shader.fragmentShader.includes('original-test-marker'))
  assert.equal(shader.vertexShader,vertex);for(const u of ['l5NestCount','l5NestBounds','l5NestDoors','l5NestHeight','l5NestCameraWorld'])assert.equal(shader.uniforms[u],(lighting2.uniforms as any)[u])
  assert(shader.fragmentShader.includes('l5PortalLight')&&shader.fragmentShader.includes('l5NestAmbient')&&shader.fragmentShader.includes('pointLight')&&shader.fragmentShader.includes('spotLight'),'portal light shader markers missing')
}
checkMaterial(new THREE.MeshLambertMaterial());checkMaterial(new THREE.MeshStandardMaterial())
camera.position.set(3,2,-4);camera.rotation.set(.2,.4,-.1);lighting.update(map,5,3.3,camera,animated);assert(lighting.uniforms.l5NestCameraWorld.value.equals(camera.matrixWorld),'camera world uniform not current')
const basic=new THREE.MeshBasicMaterial(),basicHook=basic.onBeforeCompile;new L5NestLighting().patch(basic);assert.equal(basic.onBeforeCompile,basicHook)
console.log('L5 nest lighting checks passed: bounds, animated portal, windowing, shader composition and Basic skip.')
