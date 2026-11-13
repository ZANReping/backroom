import * as THREE from 'three'

/** Legacy texture brush adapter, confined to the experimental rendering Worker.
 * It implements canvas creation and an inert crosshair sink, never browser UI. */
export function installOffscreenPlatform(width: number, height: number, assetBase: string) {
  type Sink = { style: Record<string,string>; dataset: Record<string,string>; children: Sink[]; id:string; textContent:string; appendChild:(child:Sink)=>Sink; remove:()=>void; setAttribute:()=>void; addEventListener:()=>void; removeEventListener:()=>void; querySelector:()=>Sink; querySelectorAll:()=>Sink[] }
  const node = ():Sink => {
    const children: Sink[] = []
    return {
      style: {} as Record<string, string>, dataset: {} as Record<string, string>, children, id: '', textContent: '',
      appendChild(child: Sink) { children.push(child); return child }, remove() {},
      setAttribute() {}, addEventListener() {}, removeEventListener() {},
      querySelector() { return node() }, querySelectorAll() { return [] },
    }
  }
  Object.assign(globalThis, {
    window: globalThis, innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    document: {
      createElement: (name: string) => {
        if (name === 'canvas') return new OffscreenCanvas(1, 1)
        if (name === 'div' || name === 'span') return node()
        throw new Error('Unsupported Worker DOM dependency: ' + name)
      },
      createElementNS: (_namespace:string,name:string) => { if(name==='canvas')return new OffscreenCanvas(1,1);throw new Error('Unsupported Worker DOM element: '+name) },
      getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {},
      body: node(), hidden: false,
    },
  })
  const imageLoader = function(this:THREE.ImageLoader,url:string,onLoad?:(image:unknown)=>void,_onProgress?:unknown,onError?:(error:unknown)=>void){
    const target=this.manager.resolveURL(new URL(url,assetBase).href)
    this.manager.itemStart(target)
    void fetch(target).then(r=>{if(!r.ok)throw new Error('Image '+r.status+': '+target);return r.blob()})
      .then(blob=>createImageBitmap(blob,{imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'none'}))
      .then(bitmap=>{const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();onLoad?.(canvas)})
      .catch(error=>{onError?.(error);this.manager.itemError(target)})
      .finally(()=>this.manager.itemEnd(target))
    return null
  }
  THREE.ImageLoader.prototype.load=imageLoader as unknown as THREE.ImageLoader['load']
  const bitmapLoader = function (this: THREE.TextureLoader,url: string, onLoad?: (texture: THREE.Texture) => void, _onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void) {
    const texture = new THREE.Texture(), target = this.manager.resolveURL(new URL(url, assetBase).href)
    this.manager.itemStart(target)
    void fetch(target).then(response => { if (!response.ok) throw new Error('Texture ' + response.status + ': ' + target); return response.blob() })
      .then(blob => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then(bitmap => { texture.image = bitmap; texture.needsUpdate = true; onLoad?.(texture) })
      .catch(error => { onError?.(error); this.manager.itemError(target) })
      .finally(() => this.manager.itemEnd(target))
    return texture
  }
  // TextureLoader's public typing assumes HTMLImageElement; Worker images are native ImageBitmap sources.
  THREE.TextureLoader.prototype.load = bitmapLoader as unknown as THREE.TextureLoader['load']
}
