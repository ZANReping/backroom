// 运行时校验用的 three.js 桩：只实现被本项目调用到的 API，用于跑通建模函数、捕获空引用与调用错误
class V3 { x = 0; y = 0; z = 0
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  copy(v: V3) { this.x = v.x; this.y = v.y; this.z = v.z; return this }
  add(v: V3) { this.x += v.x; this.y += v.y; this.z += v.z; return this }
  addScaledVector(v: V3, s: number) { this.x += v.x * s; return this }
  setScalar(s: number) { this.x = this.y = this.z = s; return this }
  multiplyScalar(s: number) { this.x *= s; return this }
  normalize() { return this }
  length() { return 1 }
  distanceTo() { return 1 }
  applyQuaternion() { return this }
  clone() { return new V3().copy(this) }
}
export class Color {
  r = 1; g = 1; b = 1
  constructor(_c?: unknown) { void _c }
  set(_c: unknown) { void _c; return this }
  copy(_c: Color) { void _c; return this }
  clone() { return new Color() }
  lerp(_c: Color, _t: number) { void _c; void _t; return this }
  multiplyScalar(_s: number) { void _s; return this }
  setScalar(_s: number) { void _s; return this }
  getHex() { return 0xffffff }
  setHex(_h: number) { void _h; return this }
  offsetHSL() { return this }
}
export class Vector3 extends V3 {
  constructor(x = 0, y = 0, z = 0) { super(); this.set(x, y, z) }
}
export class Vector2 extends V3 {}
export class Euler { x = 0; y = 0; z = 0; order = 'XYZ'
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this } }
export class Matrix4 { elements = new Array(16).fill(0); makeRotationY() { return this }; multiply() { return this } }
export class Quaternion {
  setFromAxisAngle() { return this }
  setFromUnitVectors() { return this }
  setFromEuler() { return this }
  multiply() { return this }
  slerp() { return this }
  copy() { return this }
  clone() { return new Quaternion() }
}
export class Object3D {
  position = new V3(); rotation = new Euler(); scale = new V3().set(1, 1, 1)
  children: Object3D[] = []; parent: Object3D | null = null
  userData: Record<string, unknown> = {}
  visible = true; name = ''; matrix = new Matrix4(); matrixAutoUpdate = true
  castShadow = false; receiveShadow = false; renderOrder = 0
  frustumCulled = true
  id = Object3D.nextId++
  static nextId = 1
  add(...o: Object3D[]) { for (const c of o) { if (!c) throw new Error('add(undefined)'); c.parent = this; this.children.push(c) } return this }
  remove(o: Object3D) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); return this }
  clear() { this.children.length = 0; return this }
  traverse(fn: (o: Object3D) => void) { fn(this); for (const c of this.children) c.traverse(fn) }
  getWorldDirection(v: V3) { return v }
  getWorldPosition(v: V3) { return v }
  lookAt() { return this }
  updateMatrix() { return this }
  updateMatrixWorld() { return this }
  removeFromParent() { return this }
  translateX(_d: number) { void _d; return this }
  translateY(_d: number) { void _d; return this }
  translateZ(_d: number) { void _d; return this }
  translateOnAxis() { return this }
  rotateX(_d: number) { void _d; return this }
  rotateY(_d: number) { void _d; return this }
  rotateZ(_d: number) { void _d; return this }
  rotateOnAxis() { return this }
  applyQuaternion() { return this }
  quaternion = new Quaternion()
  up = new V3()
}
export class Group extends Object3D {}
export class Scene extends Object3D { fog: unknown = null; background: unknown = null; environment: unknown = null }
export class BufferAttribute { constructor(public array: ArrayLike<number>, public itemSize: number) {} }
export class Float32BufferAttribute extends BufferAttribute {}
export class BufferGeometry {
  attributes: Record<string, BufferAttribute> = {}
  index: BufferAttribute | null = null
  groups: unknown[] = []
  boundingBox: unknown = null
  setAttribute(n: string, a: BufferAttribute) { this.attributes[n] = a; return this }
  getAttribute(n: string) { return this.attributes[n] }
  setIndex(a: unknown) { void a; return this }
  translate() { return this }
  rotateX() { return this }
  rotateY() { return this }
  rotateZ() { return this }
  scale() { return this }
  center() { return this }
  computeVertexNormals() { return this }
  computeBoundingBox() { return this }
  dispose() {}
  clone() { return new BufferGeometry() }
  toNonIndexed() { return this }
}
const mkGeo = (n = 24) => {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
export class BoxGeometry extends BufferGeometry { constructor(..._a: number[]) { super(); void _a; Object.assign(this, mkGeo()) } }
export class PlaneGeometry extends BoxGeometry {}
export class CylinderGeometry extends BoxGeometry {}
export class ConeGeometry extends BoxGeometry {}
export class SphereGeometry extends BoxGeometry {}
export class IcosahedronGeometry extends BoxGeometry {}
export class RingGeometry extends BoxGeometry {}
export class CircleGeometry extends BoxGeometry {}
export class TorusGeometry extends BoxGeometry {}
export class CapsuleGeometry extends BoxGeometry {}
export class TetrahedronGeometry extends BoxGeometry {}
export class OctahedronGeometry extends BoxGeometry {}
export class DodecahedronGeometry extends BoxGeometry {}
export class LatheGeometry extends BoxGeometry {}
export class ExtrudeGeometry extends BoxGeometry {}
export class ShapeGeometry extends BoxGeometry {}
export class EdgesGeometry extends BoxGeometry {}
export class Shape {
  curves: unknown[] = []
  moveTo() { return this } lineTo() { return this } quadraticCurveTo() { return this }
  bezierCurveTo() { return this } absarc() { return this } closePath() { return this }
  splineThru() { return this }
  holes: unknown[] = []
}
export class Path extends Shape {}
// v42：管道端头弧形拐弯（structures.ts pipes endEl）用到的曲线/管体
export class QuadraticBezierCurve3 {
  constructor(public v0 = new Vector3(), public v1 = new Vector3(), public v2 = new Vector3()) { void v0; void v1; void v2 }
}
export class CubicBezierCurve3 extends QuadraticBezierCurve3 {}
export class CatmullRomCurve3 extends QuadraticBezierCurve3 {}
export class TubeGeometry extends BoxGeometry { constructor(public curve?: unknown, ..._a: number[]) { super(); void curve; void _a } }
export class Material {
  color = new Color(); emissive = new Color(); userData: Record<string, unknown> = {}
  opacity = 1; transparent = false; side = 0; visible = true; map: unknown = null
  depthWrite = true; depthTest = true; emissiveIntensity = 1; shininess = 30; roughness = 1; metalness = 0
  fog = true; alphaTest = 0; vertexColors = false; wireframe = false; blending = 0; toneMapped = true
  constructor(p?: Record<string, unknown>) { if (p) Object.assign(this, p) }
  dispose() {}
  clone() { return new Material() }
}
export class MeshBasicMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class MeshPhongMaterial extends Material {}
export class MeshStandardMaterial extends Material {}
export class MeshMatcapMaterial extends Material {}
export class LineBasicMaterial extends Material {}
export class SpriteMaterial extends Material {}
export class PointsMaterial extends Material {}
export class Mesh extends Object3D {
  constructor(public geometry: BufferGeometry = new BufferGeometry(), public material: Material | Material[] = new Material()) {
    super()
    if (!geometry) throw new Error('Mesh(undefined geometry)')
    if (!material) throw new Error('Mesh(undefined material)')
  }
}
export class InstancedMesh extends Mesh {
  instanceMatrix = { needsUpdate: false }
  constructor(g: BufferGeometry, m: Material, public count: number) { super(g, m) }
  setMatrixAt(_i: number, _m: Matrix4) { void _i; void _m }
  setColorAt(_i: number, _c: Color) { void _i; void _c }
}
export class Line extends Mesh {}
export class LineSegments extends Mesh {}
export class Points extends Mesh {}
export class Sprite extends Object3D { constructor(public material?: Material) { super() } }
export class Light extends Object3D { constructor(public color = new Color(), public intensity = 1) { super() } }
export class PointLight extends Light { distance = 0; decay = 2 }
export class SpotLight extends Light { distance = 0; angle = 1; penumbra = 0; decay = 2; target = new Object3D() }
export class AmbientLight extends Light {}
export class HemisphereLight extends Light { groundColor = new Color() }
export class DirectionalLight extends Light { target = new Object3D() }
export class PerspectiveCamera extends Object3D {
  fov = 60; aspect = 1; near = 0.1; far = 1000
  constructor(f?: number, a?: number, n?: number, fa?: number) { super(); if (f) this.fov = f; void a; void n; void fa }
  updateProjectionMatrix() {}
}
export class OrthographicCamera extends PerspectiveCamera {}
export class Fog { constructor(public color: Color | string, public near = 1, public far = 100) { if (typeof color !== 'object') this.color = new Color(color) } }
export class FogExp2 extends Fog {}
export class Texture {
  wrapS = 0; wrapT = 0; repeat = { set: () => {} }; offset = { set: () => {} }
  needsUpdate = false; magFilter = 0; minFilter = 0; anisotropy = 1; colorSpace = ''
  image: unknown = null
  dispose() {}
}
export class CanvasTexture extends Texture { constructor(public canvas?: unknown) { super() } }
export class DataTexture extends Texture {}
export class WebGLRenderer {
  domElement: unknown = null
  shadowMap = { enabled: false, type: 0 }
  outputColorSpace = ''
  toneMapping = 0
  constructor(_p?: unknown) { void _p }
  setSize() {} setPixelRatio() {} render() {} dispose() {} setClearColor() {}
  getContext() { return null }
}
export class Clock { getDelta() { return 0.016 } getElapsedTime() { return 0 } }
export class Raycaster { setFromCamera() {} intersectObjects() { return [] } }
export const DoubleSide = 2, FrontSide = 0, BackSide = 1
export const RepeatWrapping = 1000, ClampToEdgeWrapping = 1001, MirroredRepeatWrapping = 1002
export const NearestFilter = 1003, LinearFilter = 1006, LinearMipmapLinearFilter = 1008, NearestMipmapNearestFilter = 1004
export const AdditiveBlending = 2, NormalBlending = 1, MultiplyBlending = 4
export const SRGBColorSpace = 'srgb', LinearSRGBColorSpace = 'srgb-linear'
export const PCFSoftShadowMap = 2, ACESFilmicToneMapping = 4
export const MathUtils = { degToRad: (d: number) => (d * Math.PI) / 180, clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)), lerp: (a: number, b: number, t: number) => a + (b - a) * t }
