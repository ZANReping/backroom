import * as THREE from 'three'
import { WallOcclusion, wallOccludesBox, extractOcclusionWalls } from '/src/game/renderer/occlusion.ts'

export async function verifyOcclusion() {
  const checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const wall={axis:'x',plane:0,low:-3,high:3,bottom:0,top:3,facing:-1}
  const eye=new THREE.Vector3(-3,1.5,0),box=new THREE.Box3(new THREE.Vector3(2,0,-2),new THREE.Vector3(3,2,2))
  assert(wallOccludesBox(wall,box,eye),'a box fully inside one opaque wall shadow is culled')
  assert(!wallOccludesBox(wall,box,new THREE.Vector3(4,1.5,0)),'a back-facing wall cannot occlude')
  assert(!wallOccludesBox({...wall,high:-1},box,eye)&&!wallOccludesBox({...wall,low:1},box,eye),'separately blocked corners never close the doorway between them')
  assert(!wallOccludesBox(wall,box.clone().translate(new THREE.Vector3(0,6,0)),eye),'above-wall geometry stays visible')
  assert(!wallOccludesBox(wall,box.clone().translate(new THREE.Vector3(-5,0,0)),eye),'near-side geometry stays visible')
  const terrain=new THREE.Group(),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide})
  for(const z of [-2,2])terrain.add(new THREE.Mesh(new THREE.PlaneGeometry(2,3).rotateY(Math.PI/2).translate(0,1.5,z),mat))
  const extracted=extractOcclusionWalls(terrain)
  assert(extracted.length===2,'wall extraction preserves a two-metre doorway')
  assert(extracted.every(w=>!wallOccludesBox(w,box,eye)),'extracted door opening does not become an occluder')
  const overlapping=new THREE.BufferGeometry()
  overlapping.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-2,0,0,2,0,3,2, 0,0,-2,0,0,2,0,3,-2],3))
  assert(extractOcclusionWalls(new THREE.Mesh(overlapping,mat)).length===0,'overlapping triangles sharing a boundary edge are not a full rectangle')
  overlapping.dispose()
  const partial=new THREE.PlaneGeometry(2,3).rotateY(Math.PI/2);partial.setDrawRange(0,3)
  assert(extractOcclusionWalls(new THREE.Mesh(partial,mat)).length===0,'undrawn triangles never become an opaque wall')
  partial.dispose()
  terrain.traverse(o=>o.geometry?.dispose());mat.dispose()
  // Exercise cache reuse and dirty bounds independently of the world generator.
  const owner=new THREE.Group(),solid=new THREE.Mesh(new THREE.PlaneGeometry(8,4).rotateY(Math.PI/2).translate(0,2,0),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))
  const prop=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial())
  prop.position.set(2,1.5,0);owner.add(solid,prop)
  const occlusion=new WallOcclusion(),camera=new THREE.PerspectiveCamera()
  occlusion.register(owner,solid,[prop]);camera.position.set(-3,1.5,0);occlusion.update(camera,true)
  assert(!prop.visible,'registered furniture is hidden behind a complete wall')
  camera.position.x+=.1;occlusion.update(camera,true)
  assert(!prop.visible,'certified camera movement reuses the hidden state')
  prop.position.z=8;occlusion.changed(prop);occlusion.update(camera,true)
  assert(prop.visible&&occlusion.lastHidden===0,'moving furniture invalidates only its bounds and hidden count')
  prop.position.z=0;occlusion.changed(prop);occlusion.update(camera,true)
  assert(!prop.visible&&occlusion.lastHidden===1,'moving furniture behind the wall is culled again')
  owner.position.z=10;occlusion.update(camera,true)
  assert(prop.visible,'chunk translation invalidates wall and candidate coordinates')
  camera.position.z=10;occlusion.update(camera,true)
  assert(!prop.visible,'translated wall and furniture share the new world coordinates')
  occlusion.update(camera,false);assert(prop.visible,'real-time shadows restore hidden render objects')
  occlusion.update(camera,true);occlusion.remove(owner);assert(prop.visible,'chunk removal restores candidate visibility')
  solid.geometry.dispose();solid.material.dispose();prop.geometry.dispose();prop.material.dispose()
  const {engine:e,renderer:r,look}=perfQA
  for(const id of [4,5,105,106]){
    await perfQA.measure(id,60)
    e.dev.god=true;e.dev.statLock=true;e.paused=true
    const start={x:e.player.x,y:e.player.y,z:e.player.z},gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
    const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length)
    for(let n=0;n<24;n++){
      e.player.x=start.x+(n%3-1)*.4;e.player.y=start.y+(n%2)*.35;e.player.z=start.z+(n>=18?1.2:0)
      look.yaw=n*Math.PI/12;look.pitch=n>=18?.25:0
      r.wallOcclusion.enabled=false;r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
      // Apply any deferred render-only pose changes before taking the reference.
      r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
      // Compare the same prepared scene. Calling the game render loop again can
      // advance deferred lighting/viewmodel state even when dt is zero.
      r.wallOcclusion.enabled=true;r.wallOcclusion.update(r.camera,!r.three.shadowMap.enabled)
      r.three.render(r.scene,r.camera)
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
      let changed=0,maxDelta=0
      for(let i=0;i<before.length;i++){const d=Math.abs(before[i]-after[i]);if(d){changed++;maxDelta=Math.max(maxDelta,d)}}
      rows.push({level:id,pose:n,hidden:r.wallOcclusion.lastHidden,changed,maxDelta})
      assert(changed===0,`L${id} pose ${n}: culling preserves every rendered pixel (${changed} changed, max delta ${maxDelta})`)
      await new Promise(requestAnimationFrame)
    }
    // Preserve the enabled cache between renders. Bypass only its update while
    // taking the reference image, then restore the exact previous visibility.
    const compareCached=label=>{
      r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},0)
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after)
      const visibility=[...r.wallOcclusion.candidates.keys()].map(root=>[root,root.visible])
      const update=r.wallOcclusion.update
      try{
        r.wallOcclusion.update=()=>{}
        for(const [root] of visibility)root.visible=true
        r.three.render(r.scene,r.camera)
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before)
      }finally{r.wallOcclusion.update=update;for(const [root,visible] of visibility)root.visible=visible}
      let changed=0
      for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed++
      rows.push({level:id,pose:label,hidden:r.wallOcclusion.lastHidden,changed})
      assert(changed===0,`L${id} ${label}: cached occlusion preserves every pixel (${changed} changed)`)
    }
    Object.assign(e.player,start);look.yaw=0;look.pitch=0
    for(let n=0;n<6;n++){
      e.player.x=start.x+n*.06;e.player.y=start.y+n*.025;look.yaw+=.2
      compareCached(`cached walk ${n}`)
      await new Promise(requestAnimationFrame)
    }
    const animated=[...r.animatedStructMeshes].find(([s,g])=>r.wallOcclusion.candidates.has(g)&&s.kind==='hoteldoor')
    if(animated){
      const [s]=animated;s.data??={};s.data.open=1
      for(let n=0;n<6;n++){r.updateStructs(.08);compareCached(`door opening ${n}`);await new Promise(requestAnimationFrame)}
      s.data.open=0
      for(let n=0;n<6;n++){r.updateStructs(.08);compareCached(`door closing ${n}`);await new Promise(requestAnimationFrame)}
    }
    Object.assign(e.player,start)
  }
  r.wallOcclusion.enabled=true
  return {passed:checks.length,checks,rows}
}
