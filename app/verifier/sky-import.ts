import * as THREE from 'three'
import { SkySystem, skyNoiseTexture } from '../src/game/renderer/skySystem'
import { skyLightDir, SKY_PROFILES } from '../src/game/renderer/skybox'

// Runs against the actual Engine/Renderer, with isolated verifier storage.
export async function verifySkyImport(qa: any) {
  let checks = 0
  const check = (ok: unknown, reason: string) => { if (!ok) throw Error(reason); checks++ }
  const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))
  const renderer: THREE.WebGLRenderer = qa.r.three
  const sys = () => qa.r.skyMesh?.userData.sky as SkySystem
  const inspect = (s: SkySystem) => s as any
  check(sys() instanceof SkySystem, 'Actual L10 uses imported sky')
  check(qa.r.skyMesh.position.distanceTo(qa.r.camera.position) < 1e-6, 'Sky follows camera elevation')
  const noise = skyNoiseTexture()
  check(noise.image.width === 48 && noise.image.data.length === 48 ** 3 * 2, 'Bounded shared noise')
  for (const v of noise.image.data) check(Number.isFinite(v), 'Finite noise voxel')

  const weather = { ...qa.eng.l10Weather }, weatherRecords = []
  for (const kind of ['calm', 'rain', 'mist', 'gust']) {
    Object.assign(qa.eng.l10Weather, { kind, k: 1, wetness: kind === 'rain' ? 1 : 0 })
    await frame(); await frame()
    const s = inspect(sys()), boost = kind === 'rain' ? .14 : kind === 'mist' ? .06 : kind === 'gust' ? -.05 : 0
    check(Math.abs(s.cloudMat.uniforms.uCoverage.value - Math.min(.97, s.baseCoverage + boost)) < 1e-6, 'Weather cloud coverage '+kind)
    check(s.skyMat.uniforms.uFogMix.value === (kind === 'mist' ? .72 : kind === 'rain' ? .18 : 0), 'Weather fog '+kind)
    weatherRecords.push({ kind, coverage: s.cloudMat.uniforms.uCoverage.value, fog: s.skyMat.uniforms.uFogMix.value })
  }
  Object.assign(qa.eng.l10Weather, weather)
  const time = qa.eng.time
  qa.eng.time = 600; await frame(); await frame()
  check(inspect(sys()).cloudMat.uniforms.uWind.value.x === 600 * .00055, 'Game time drives cloud wind')
  qa.eng.time = time

  const qRecords = []
  for (const q of [0, 2, 0, 2]) {
    qa.r.setTextureQuality(q); await frame(); await frame()
    const s = inspect(sys())
    check(s.rt.width === (q === 0 ? 256 : 512), 'Live cloud quality width')
    check(s.rt.height === (q === 0 ? 96 : 192), 'Live cloud quality height')
    qRecords.push({quality:q, memory:{...renderer.info.memory}, programs:renderer.info.programs?.length})
  }
  check(JSON.stringify(qRecords[1]) === JSON.stringify(qRecords[3]), 'Cloud quality switching does not grow resources')

  // All profiles must draw finite scattering/transmittance and release private resources.
  const profiles = []
  let disposals = 0
  const onNoiseDispose = () => { disposals++ }
  noise.addEventListener('dispose', onNoiseDispose)
  const target = new THREE.WebGLCubeRenderTarget(16)
  renderer.setRenderTarget(target, 2, 0)
  const oldAuto = renderer.autoClear
  for (const id of Object.keys(SKY_PROFILES).map(Number)) {
    const memoryBefore = { ...renderer.info.memory }
    const s = new SkySystem(id, skyLightDir(id))
    s.update(renderer, 60, new THREE.Color('#71797b'))
    check(renderer.getRenderTarget() === target && renderer.getActiveCubeFace() === 2, 'Cloud pass restores cube target')
    check(renderer.autoClear === oldAuto, 'Cloud pass restores autoClear')
    renderer.render(s.mesh, new THREE.PerspectiveCamera(75, 1, .1, 60))
    // Three.js pixel-read restore expects a 2D framebuffer, not a cube's array.
    renderer.setRenderTarget(null)
    const rt = inspect(s).rt as THREE.WebGLRenderTarget
    const pixels = new Uint16Array(rt.width * rt.height * 4)
    renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, pixels)
    let transMin = 1, transMax = 0
    for (let i = 0; i < pixels.length; i++) {
      const v = THREE.DataUtils.fromHalfFloat(pixels[i])
      check(Number.isFinite(v) && v >= 0, 'Finite nonnegative cloud radiance L'+id)
      if (i % 4 === 3) { check(v <= 1, 'Transmittance in range'); transMin = Math.min(transMin, v); transMax = Math.max(transMax, v) }
    }
    profiles.push({id, width:rt.width, height:rt.height, transMin, transMax})
    s.dispose(); s.dispose()
    check(renderer.info.memory.geometries === memoryBefore.geometries && renderer.info.memory.textures === memoryBefore.textures, 'All private sky GPU allocations released L'+id)
    renderer.setRenderTarget(target, 2, 0)
  }
  renderer.setRenderTarget(null); target.dispose()
  check(disposals === 0, 'Disposing other skies retains live game noise')
  noise.removeEventListener('dispose', onNoiseDispose)
  // Even a failed offscreen draw must leave the production renderer usable.
  const draw = renderer.render
  renderer.render = () => { throw Error('QA injected cloud failure') }
  try { sys().update(renderer, 90) } catch (e) { check(String(e).includes('QA injected'), 'Expected injected failure') }
  finally { renderer.render = draw }
  check(renderer.getRenderTarget() === null && renderer.autoClear === oldAuto, 'Exception restores render state')

  const modes = []
  for (const mode of ['classic', 'realistic', 'classic', 'realistic', 'classic', 'realistic']) {
    const previous = inspect(sys())
    let freed = 0
    for (const resource of [previous.rt, previous.cloudMat, previous.skyMat, previous.mesh.geometry, previous.scene.children[0].geometry]) resource.addEventListener('dispose', () => { freed++ })
    qa.mode(mode); await qa.warm()
    check(previous.disposed, 'Previous sky disposed during rebuild')
    check(freed === 5, 'Every private sky resource disposed exactly once')
    const s = inspect(sys())
    check(s.rt.width === (mode === 'classic' ? 256 : 512), 'Correct mode quality')
    modes.push({mode, memory:{...renderer.info.memory}, programs:renderer.info.programs?.length})
  }
  // Both modes first populate the game's bounded held-item/material caches.
  // Frustum-dependent game geometry/program uploads can vary with idle camera
  // motion. Assert sky ownership above and texture counts here; record the full
  // game counters rather than misclassifying a first visible upload as a leak.
  for (let i = 4; i < modes.length; i++) check(modes[i].memory.textures === modes[i-2].memory.textures, 'Stable rebuilt texture allocations: '+JSON.stringify(modes))
  return { checks, weatherRecords, qualitySwitches:qRecords, profiles, modes }
}
