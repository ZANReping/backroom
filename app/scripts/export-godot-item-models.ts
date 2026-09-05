import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, ImageData, createCanvas, loadImage } from '@napi-rs/canvas'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

type FileReaderHandler = ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null

class NodeFileReader {
  result: string | ArrayBuffer | null = null
  error: DOMException | null = null
  onloadend: FileReaderHandler = null

  async readAsArrayBuffer(blob: Blob) {
    this.result = await blob.arrayBuffer()
    this._finish()
  }

  async readAsDataURL(blob: Blob) {
    const bytes = Buffer.from(await blob.arrayBuffer())
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`
    this._finish()
  }

  private _finish() {
    queueMicrotask(() => this.onloadend?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>))
  }
}

const canvasPrototype = Canvas.prototype as Canvas & {
  toBlob?: (callback: (blob: Blob) => void, mimeType?: string) => void
}
if (!canvasPrototype.toBlob) {
  canvasPrototype.toBlob = function (callback, mimeType = 'image/png') {
    const canvas = this as unknown as Canvas
    const format = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    callback(new Blob([canvas.toBuffer(format)], { type: format }))
  }
}

Object.assign(globalThis, {
  FileReader: NodeFileReader,
  HTMLCanvasElement: Canvas,
  ImageData,
  document: {
    createElement: (name: string) => {
      if (name !== 'canvas') throw new Error(`Unsupported export DOM element: ${name}`)
      return createCanvas(1, 1)
    },
  },
})

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const textureDirectory = join(appDirectory, 'public', 'textures')
const outputDirectory = resolve(appDirectory, '..', 'Godot', 'backroom', 'features', 'items', 'models', 'baked')

async function pngTexture(fileName: string): Promise<THREE.DataTexture> {
  const image = await loadImage(join(textureDirectory, fileName))
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height).data
  const texture = new THREE.DataTexture(new Uint8Array(pixels), image.width, image.height, THREE.RGBAFormat)
  texture.name = fileName
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = true
  texture.needsUpdate = true
  return texture
}

function copySampler(source: THREE.Texture, target: THREE.Texture): THREE.Texture {
  target.wrapS = source.wrapS
  target.wrapT = source.wrapT
  target.magFilter = source.magFilter
  target.minFilter = source.minFilter
  target.anisotropy = source.anisotropy
  target.offset.copy(source.offset)
  target.repeat.copy(source.repeat)
  target.center.copy(source.center)
  target.rotation = source.rotation
  target.matrixAutoUpdate = source.matrixAutoUpdate
  if (!source.matrixAutoUpdate) target.matrix.copy(source.matrix)
  target.flipY = true
  target.needsUpdate = true
  return target
}

async function installSourceTexture(root: THREE.Object3D, fileName: string) {
  const decoded = await pngTexture(fileName)
  const replacements = new Map<string, THREE.Texture>()
  const replacementFor = (source: THREE.Texture) => {
    let replacement = replacements.get(source.uuid)
    if (!replacement) {
      replacement = copySampler(source, decoded.clone())
      replacement.name = fileName
      replacements.set(source.uuid, replacement)
    }
    return replacement
  }
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const material of materials) {
      const mapped = material as THREE.MeshStandardMaterial
      if (mapped.map) mapped.map = replacementFor(mapped.map)
      if (mapped.emissiveMap) mapped.emissiveMap = replacementFor(mapped.emissiveMap)
      if (mapped.bumpMap) mapped.bumpMap = replacementFor(mapped.bumpMap)
      material.needsUpdate = true
    }
  })
}

async function exportBinary(root: THREE.Object3D, fileName: string) {
  root.updateMatrixWorld(true)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(root, {
    binary: true,
    onlyVisible: false,
    trs: false,
  })
  if (!(result instanceof ArrayBuffer)) throw new Error(`Expected binary GLB for ${fileName}`)
  await writeFile(join(outputDirectory, fileName), Buffer.from(result))
}

async function main() {
  const [{ setMaterialMode }, { buildFlashlightMesh }, provisions, supplies] = await Promise.all([
    import('../src/game/renderer/shared'),
    import('../src/game/renderer/flashlightMesh'),
    import('../src/game/renderer/provisionsMesh'),
    import('../src/game/renderer/supplyMesh'),
  ])
  setMaterialMode('realistic')
  await mkdir(outputDirectory, { recursive: true })

  const models = [
    { file: 'flashlight.glb', texture: 'flashlight_uv_atlas.png', root: buildFlashlightMesh({ lit: true }) },
    { file: 'battery.glb', texture: 'item_battery_wrapper_uv.png', root: provisions.buildBatteryMesh() },
    { file: 'almond_water.glb', texture: 'item_almond_thermos_uv.png', root: provisions.buildWaterThermosMesh('almond') },
    { file: 'canned_food.glb', texture: 'item_canned_label_uv.png', root: supplies.buildCannedFoodMesh() },
    { file: 'bandage.glb', texture: 'item_bandage_gauze_uv.png', root: supplies.buildBandageMesh() },
  ]

  for (const model of models) {
    await installSourceTexture(model.root, model.texture)
    await exportBinary(model.root, model.file)
  }
}

await main()
