/** Count CPU and uploaded GPU geometries separately. Hidden interiors can upload
 * at different points during a stream; their live buffers are not orphaned ones. */
export function l11ResourceSnapshot(qa:any){
  const r=qa.r,uploaded=(g:any)=>g?._listeners?.dispose?.some((fn:Function)=>fn.name==='onGeometryDispose')??false
  const count=(roots:any[])=>{const all=new Set<any>();for(const root of roots)root.traverse((o:any)=>{if(o.geometry)all.add(o.geometry)});return {cpu:all.size,gpu:[...all].filter(uploaded).length}}
  const entityGroups=[...r.entityMeshes.values()],entities=count(entityGroups)
  const byType:Record<string,{models:number;cpu:number;gpu:number}>={}
  for(const g of entityGroups){const key=g.userData.entType??'unknown',c=count([g]),sum=byType[key]??={models:0,cpu:0,gpu:0};sum.models++;sum.cpu+=c.cpu;sum.gpu+=c.gpu}
  const scene=count([r.scene])
  const textureAllocations=qa.textureAudit?.(),cachedAvatarTextures=textureAllocations?.live.filter((t:any)=>t.textures.some((p:any)=>p.avatarPool)).length??0
  return {memory:{...r.three.info.memory},cachedAvatarTextures,nonPooledTextures:r.three.info.memory.textures-cachedAvatarTextures,programs:r.three.info.programs.length,buildings:r.cityInstances.size,references:qa.eng.map.inf.cityReferences.size,roots:r.textureRoots.size,pending:qa.pendingWork(),textureAllocations,geometryAudit:{scene,entities:{...entities,byType},city:count([...r.chunkGroups.values()].map((c:any)=>c.group)),buildings:count([...r.cityInstances.values()].map((b:any)=>b.mesh)),offScene:r.three.info.memory.geometries-scene.gpu}}
}

/** Optional QA instrumentation; the production renderer is unchanged. Track
 * actual GL allocations, including render targets outside the scene graph. */
export function installL11TextureAudit(qa:any,stacks=false){
  const gl=qa.r.three.getContext(),create=gl.createTexture.bind(gl),remove=gl.deleteTexture.bind(gl),live=new Map<WebGLTexture,{id:number;stack:string}>();let serial=0
  const properties=qa.r.three.properties,get=properties.get.bind(properties),textures=new Map<any,{properties:any;disposals:number}>()
  properties.get=(object:any)=>{
    const value=get(object)
    if(object?.isTexture){let record=textures.get(object);if(!record){record={properties:value,disposals:0};textures.set(object,record);object.addEventListener('dispose',()=>record!.disposals++)}else record.properties=value}
    return value
  }
  gl.createTexture=()=>{const texture=create();if(texture)live.set(texture,{id:++serial,stack:stacks?new Error().stack??'':''});return texture}
  gl.deleteTexture=(texture:WebGLTexture|null)=>{if(texture)live.delete(texture);remove(texture)}
  qa.textureAudit=()=>{
    const owners=new Map<any,string[]>(),add=(t:any,label:string)=>{if(t?.isTexture)owners.set(t,[...(owners.get(t)??[]),label])}
    qa.r.scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){for(const t of Object.values(m))add(t,`${o.name||o.type}:${m.name||m.type}`);for(const u of Object.values(m.uniforms??{}) as any[])add(u.value,`${o.name||o.type}:uniform`)}add(o.skeleton?.boneTexture,`${o.name||o.type}:skeleton`)})
    const byHandle=new Map<any,any[]>()
    for(const [t,record]of textures){const handle=record.properties.__webglTexture;if(!handle)continue;const image=t.image,src=image?.src??image?.[0]?.src
      // These factories intentionally retain a finite shared CPU/GPU pool:
      // 8 tops × 6 trousers, five faceless skins and four hair images. New
      // spawned facelings may warm new combinations on each trip. Everything
      // else, including unidentified/ownerless textures, remains in the strict
      // resource regression count below.
      const avatarPool=!!t.userData.retroShared&&(image instanceof HTMLCanvasElement&&image.width===128&&image.height===128||/\/npc-retro\/(faceless\/t[0-4]|cloth\/hair-(straight|crop|curly|dreads))\.png$/.test(src??''))
      const detail={uuid:t.uuid,name:t.name,src,size:[image?.width,image?.height],flags:Object.keys(t.userData),avatarPool,disposals:record.disposals,owners:[...new Set(owners.get(t)??[])].slice(0,5),world:qa.r.worldTextures.has(t),retired:qa.r.retiredTextures.has(t),refs:qa.r.textureUsers.get(t)};byHandle.set(handle,[...(byHandle.get(handle)??[]),detail])}
    return {created:serial,live:[...live].map(([handle,record])=>({...record,textures:byHandle.get(handle)??[]}))}
  }
}
