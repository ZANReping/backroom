import { skyTexture } from '/src/game/renderer/skyTextureCache.ts'
import { skyTexture as baseline } from '/verifier/skybox-baseline.ts'
import { levelDefOf } from '/src/game/levels/index.ts'
import { disposeEnvProbes } from '/src/game/renderer/envProbe.ts'

export async function verifySkyTextures() {
  const rows=[],ids=[2,3,4,5,6,7],pending=[]
  const three=perfQA.renderer.three,gl=three.getContext()
  for(const id of ids){const at=performance.now(),texture=skyTexture(id);pending.push({id,texture,requestMs:performance.now()-at});three.initTexture(texture)}
  const r=perfQA.renderer,previous={sky:r.skyMesh,mode:r.lightMode,environment:r.scene.environment,probe:r.pendingEnvProbe}
  const verifyProbe=ready=>{
    try {
      r.skyMesh={material:{map:pending.find(j=>j.id===7).texture}};r.lightMode='realistic'
      r.applyEnvProbe(levelDefOf(7))
      if(ready?(!r.scene.environment||r.pendingEnvProbe):(r.scene.environment!==null||!r.pendingEnvProbe))throw new Error('Environment probe did not wait for the final sky pixels')
    }finally{r.skyMesh=previous.sky;r.lightMode=previous.mode;r.scene.environment=previous.environment;r.pendingEnvProbe=previous.probe}
  }
  verifyProbe(false)
  let animationFrames=0
  const started=performance.now()
  while(pending.some(job=>job.texture.userData.skyPending)){
    await new Promise(requestAnimationFrame);animationFrames++
    if(performance.now()-started>20_000)throw new Error('Sky Worker timed out')
  }
  for(const job of pending){
    three.initTexture(job.texture)
    if(gl.getError()!==gl.NO_ERROR)throw new Error(`L${job.id}: failed to replace placeholder GPU storage`)
    const actual=job.texture.image.getContext('2d').getImageData(0,0,2048,1024).data
    const expected=baseline(job.id).image.getContext('2d').getImageData(0,0,2048,1024).data
    let changed=0
    for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++
    if(changed)throw new Error(`L${job.id} sky: ${changed} changed bytes`)
    if(skyTexture(job.id)!==job.texture)throw new Error('Sky revisit recreated the texture')
    rows.push({level:job.id,changed,requestMs:job.requestMs})
  }
  if(animationFrames<2)throw new Error('No animation progress during uncached sky generation')
  verifyProbe(true);disposeEnvProbes()
  const NativeWorker=window.Worker
  try {
    window.Worker=class { constructor(){throw new Error('test worker unavailable')} }
    const texture=skyTexture(9)
    while(texture.userData.skyPending)await new Promise(requestAnimationFrame)
    const actual=texture.image.getContext('2d').getImageData(0,0,2048,1024).data
    const expected=baseline(9).image.getContext('2d').getImageData(0,0,2048,1024).data
    let changed=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++
    if(changed)throw new Error(`Fallback sky: ${changed} changed bytes`)
    rows.push({level:9,fallback:true,changed})
  }finally{window.Worker=NativeWorker}
  return {passed:rows.length+2,animationFrames,environmentProbeWaitsForSky:true,rows}
}
