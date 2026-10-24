import * as THREE from 'three'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { BreakCubeCapture } from '../core/breakCube'

const DIRS = [[1,0,0,0,1,0],[-1,0,0,0,1,0],[0,1,0,0,0,-1],[0,-1,0,0,0,1],[0,0,1,0,1,0],[0,0,-1,0,1,0]]
export function breakCubePose(scene: THREE.Scene, cam: THREE.PerspectiveCamera, ground: number, face = 512): BreakCubeCapture {
  const cc = new THREE.PerspectiveCamera(90, 1, cam.near, Math.max(cam.far, 80)), bases: number[] = []
  for (const d of DIRS) {
    cc.up.set(d[3],d[4],d[5]); cc.lookAt(d[0],d[1],d[2]); cc.updateMatrixWorld(true)
    const e = cc.matrixWorld.elements; bases.push(e[0],e[1],e[2],e[4],e[5],e[6],-e[8],-e[9],-e[10])
  }
  const atlas = document.createElement('canvas'); atlas.width = face * 3; atlas.height = face * 2
  const q = cam.quaternion
  return { atlas, face, bases, groundY: ground - cam.position.y, quat: [q.x,q.y,q.z,q.w], fov: cam.fov, bg: scene.background instanceof THREE.Color ? scene.background.getHex() : 0x05070c }
}

/** One offscreen face per frame; a single PBO/fence readback instead of six blocking canvas copies.
 * Linear scene targets reuse the game's already-warm shaders. OutputPass converts only the atlas,
 * avoiding a new tone-mapped variant of every street material at the moment of falling.
 */
export async function captureBreakCubeAsync(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, ground: number, maxFace: number, signal?: AbortSignal): Promise<BreakCubeCapture | null> {
  const cube = breakCubePose(scene, cam, ground), S = Math.min(maxFace, Math.max(128, r.domElement.height))
  cube.face = S; cube.atlas.width = S * 3; cube.atlas.height = S * 2
  const cc = new THREE.PerspectiveCamera(90,1,cam.near,Math.max(cam.far,80)); cc.position.copy(cam.position)
  const face = new THREE.WebGLRenderTarget(S,S,{ type: THREE.HalfFloatType, depthBuffer: true })
  const atlas = new THREE.WebGLRenderTarget(S*3,S*2,{ depthBuffer: false })
  const output = new OutputPass(), start = performance.now(), times: number[] = []
  const nextFrame = () => new Promise<void>(resolve => {
    const id = requestAnimationFrame(() => { signal?.removeEventListener('abort', abort); resolve() })
    const abort = () => { cancelAnimationFrame(id); resolve() }
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort()
  })
  try {
    for (let i=0;i<6;i++) {
      await nextFrame(); if (signal?.aborted) return null
      const t = performance.now(), target = r.getRenderTarget(), vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), scT = r.getScissorTest(), auto = r.autoClear
      const hidden: THREE.Object3D[] = []
      cam.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) { o.visible = false; hidden.push(o) } })
      try {
        const d = DIRS[i]; cc.up.set(d[3],d[4],d[5]); cc.lookAt(cc.position.x+d[0],cc.position.y+d[1],cc.position.z+d[2])
        r.autoClear = true; r.setRenderTarget(face); r.setScissorTest(false); r.render(scene,cc)
        // Render target viewports use physical pixels and do not touch the visible game canvas.
        atlas.viewport.set((i%3)*S,(1-Math.floor(i/3))*S,S,S)
        atlas.scissor.copy(atlas.viewport); atlas.scissorTest = true
        output.render(r,atlas,face,0,false)
      } finally {
        for (const o of hidden) o.visible = true
        r.autoClear = auto; r.setRenderTarget(target); r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scT)
      }
      times.push(performance.now()-t)
    }
    const pixels = new Uint8Array(S*S*6*4)
    await r.readRenderTargetPixelsAsync(atlas,0,0,S*3,S*2,pixels)
    if (signal?.aborted) return null
    const g = cube.atlas.getContext('2d'); if (!g) return null
    const img = g.createImageData(S*3,S*2), stride = S*3*4
    for(let y=0;y<S*2;y++)img.data.set(pixels.subarray((S*2-1-y)*stride,(S*2-y)*stride),y*stride)
    g.putImageData(img,0,0)
    let sum=0,max=0,lit=0;for(let i=0;i<pixels.length;i+=4){const v=pixels[i]+pixels[i+1]+pixels[i+2];sum+=v;max=Math.max(max,v);if(v>10)lit++}
    if ((globalThis as unknown as { __foyerAudit?: boolean }).__foyerAudit) (globalThis as unknown as { __breakAtlas?: HTMLCanvasElement }).__breakAtlas=cube.atlas
    ;(globalThis as unknown as { __breakCaptureStats?: unknown }).__breakCaptureStats = { faceMs: times, elapsedMs: performance.now()-start, face: S, asynchronousReadback: true, rgbMean:sum/(S*S*6*3),maxRGB:max,litPixels:lit }
    return cube
  } catch (error) { if (!signal?.aborted) console.warn('[RealityBreak] capture failed', error); return null }
  finally { face.dispose(); atlas.dispose(); output.dispose() }
}
