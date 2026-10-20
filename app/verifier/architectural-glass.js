import * as THREE from 'three'
import { buildStructure } from '/src/game/renderer/structures.ts'
import { L9 } from '/src/game/levels/l9.ts'
import { architecturalGlassMaterial, getMaterialMode, setMaterialMode } from '/src/game/renderer/shared.ts'

export async function verifyArchitecturalGlass() {
  const checks=[],rows=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const planar=architecturalGlassMaterial(true),solid=architecturalGlassMaterial(),baseline=planar.clone(),oldMode=getMaterialMode()
  baseline.forceSinglePass=false
  assert(planar!==solid&&planar===architecturalGlassMaterial(true)&&solid===architecturalGlassMaterial(false),'separate shared materials for planar and solid glass')
  assert(planar.forceSinglePass&&!solid.forceSinglePass&&planar.side===THREE.DoubleSide&&solid.side===THREE.DoubleSide,'only planar glass uses a single double-sided pass')
  const a=planar.toJSON(),b=solid.toJSON();for(const v of [a,b]){delete v.uuid;delete v.forceSinglePass}
  assert(JSON.stringify(a)===JSON.stringify(b),'all other glass parameters and ownership flags match')
  const three=new THREE.WebGLRenderer({antialias:false}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,300),target=new THREE.WebGLRenderTarget(192,192)
  three.setRenderTarget(target);scene.background=new THREE.Color('#77808d');scene.fog=new THREE.Fog('#77808d',30,130)
  scene.add(new THREE.AmbientLight('#d9e5ff',.9));const light=new THREE.DirectionalLight('#fff1d9',2);light.position.set(4,9,6);scene.add(light)
  const draw=()=>{three.info.reset();three.render(scene,camera);const bytes=new Uint8Array(192*192*4);three.readRenderTargetPixels(target,0,0,192,192,bytes);return {bytes,calls:three.info.render.calls}}
  const compare=(panes,label)=>{
    for(const mesh of panes)mesh.material=baseline;const before=draw()
    for(const mesh of panes)mesh.material=planar;const after=draw()
    let maxDelta=0;for(let i=0;i<before.bytes.length;i++)maxDelta=Math.max(maxDelta,Math.abs(before.bytes[i]-after.bytes[i]))
    assert(maxDelta===0,`${label}: pixels match from either side`)
    assert(after.calls<=before.calls,`${label}: draw count does not increase`)
    rows.push({label,maxDelta,beforeCalls:before.calls,afterCalls:after.calls})
  }
  try {
    // Isolated overlapping panes exercise both normals, mirrored winding, grazing angles and transparency ordering.
    const panes=[]
    for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.4,1.2),planar);mesh.position.set(i*.13,0,i*.11);scene.add(mesh);panes.push(mesh)}
    try{
      for(let pose=0;pose<16;pose++){
        for(const [i,mesh] of panes.entries()){mesh.rotation.set(pose%3*.11,i*.12,pose%4*.08);mesh.scale.x=pose%4===3?-1:1}
        camera.position.set(Math.sin(pose*Math.PI/8)*2.8,.4,Math.cos(pose*Math.PI/8)*2.8);camera.lookAt(0,0,.1)
        compare(panes,`overlap/${pose}`)
        const row=rows.at(-1);assert(row.beforeCalls-row.afterCalls===3,`overlap/${pose}: one draw removed per visible plane`)
      }
    }finally{for(const mesh of panes){mesh.removeFromParent();mesh.geometry.dispose()}}
    for(const mode of ['classic','realistic'])for(let style=0;style<20;style++){
      setMaterialMode(mode)
      const house=buildStructure({kind:'house',x:0,y:0,w:12,h:10,data:{style,stories:3,front:['s','e','n','w'][style%4]}},L9,{},3.2)
      assert(!!house,`${mode}/${style}: house built`)
      const panes=[];house.traverse(o=>{if(o.material===planar)panes.push(o)})
      assert(panes.length>0&&panes.every(o=>o.geometry.type==='PlaneGeometry'),`${mode}/${style}: only upper window planes opt in`)
      scene.add(house)
      const bounds=new THREE.Box3().setFromObject(house),center=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).length()*.5
      try{
        for(let pose=0;pose<6;pose++){
          house.scale.x=pose%2?-1:1
          const c=pose%2?center.clone().multiply(new THREE.Vector3(-1,1,1)):center
          camera.position.copy(c).add(new THREE.Vector3(Math.sin(pose*Math.PI/3)*radius*2.4,radius*.5,Math.cos(pose*Math.PI/3)*radius*2.4));camera.lookAt(c)
          compare(panes,`${mode}/${style}/${pose}`)
        }
      }finally{house.removeFromParent();house.traverse(o=>o.geometry?.dispose())}
      await new Promise(requestAnimationFrame)
    }
    const window=buildStructure({kind:'l9window',x:0,y:0,w:1,h:1,data:{}},L9,{},3.2),solidParts=[]
    window.traverse(o=>{if(o.material===solid)solidParts.push(o)})
    assert(solidParts.length===1&&solidParts[0].geometry.type==='BoxGeometry'&&!solidParts[0].material.forceSinglePass,'thick ground-floor window keeps both passes')
    window.traverse(o=>o.geometry?.dispose())
    assert(three.getContext().getError()===three.getContext().NO_ERROR,'no WebGL errors')
  }finally{setMaterialMode(oldMode);baseline.dispose();target.dispose();three.dispose();three.forceContextLoss()}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}

export async function measureArchitecturalGlassPairs() {
  const {renderer:r,engine:e,look}=perfQA,panes=[],baselines=new Map(),oldYaw=look.yaw
  r.scene.traverse(o=>{
    if(!o.isMesh||!o.material?.userData.sharedArchitecturalGlass||!o.material.forceSinglePass)return
    let baseline=baselines.get(o.material);if(!baseline){baseline=o.material.clone();baseline.forceSinglePass=false;baselines.set(o.material,baseline)}
    panes.push({mesh:o,single:o.material,double:baseline})
  })
  if(e.player.level!==9||!panes.length)throw new Error('Prepare the current L9 scene before measuring')
  const render=enabled=>{for(const p of panes)p.mesh.material=enabled?p.single:p.double;r.three.info.reset();const t=performance.now();r.three.render(r.scene,r.camera);return {cpu:performance.now()-t,calls:r.three.info.render.calls}}
  const rows=[]
  try {
    for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);render(false);render(true)}
    for(let i=0;i<240;i++){
      await new Promise(requestAnimationFrame);look.yaw=oldYaw+i*Math.PI*2/240;r.applyView(e)
      const pair={};for(const enabled of i%2?[true,false]:[false,true])pair[enabled?'single':'double']=render(enabled)
      rows.push(pair)
    }
  }finally{look.yaw=oldYaw;r.applyView(e);for(const p of panes)p.mesh.material=p.single;for(const m of baselines.values())m.dispose()}
  const p=(a,q)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*q)]
  const summary=key=>({cpuP50:p(rows.map(r=>r[key].cpu),.5),cpuP90:p(rows.map(r=>r[key].cpu),.9),callsP50:p(rows.map(r=>r[key].calls),.5)})
  return {level:9,panes:panes.length,samples:rows.length,double:summary('double'),single:summary('single'),rows,note:'One frozen L9 scene, alternating paired render order during a 360 degree look. Desktop CPU pressure only; GPU remains desktop hardware.'}
}
