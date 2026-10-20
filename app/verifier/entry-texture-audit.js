export function auditEntryTextures(renderer) {
  const gl=renderer.getContext(),create=gl.createTexture,remove=gl.deleteTexture,live=new Map()
  let sequence=0,cycle=0
  gl.createTexture=function(...args){const value=create.apply(this,args);live.set(value,{id:++sequence,cycle,stack:new Error().stack});return value}
  gl.deleteTexture=function(texture){live.delete(texture);return remove.call(this,texture)}
  return {
    begin(value){cycle=value},
    snapshot(){return[...live.values()]},
    stop(){gl.createTexture=create;gl.deleteTexture=remove},
  }
}
