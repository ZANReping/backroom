export async function verifyAudioNoise() {
  const checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const a=await import('/src/game/core/audio.ts').then(m=>m.audio)
  a.ensure()
  if(!a.ctx)throw new Error('AudioContext unavailable')
  const originalCtx=a.ctx, originalBufferCtx=a.noiseBufferCtx, originalBuffer=a.noiseBuffer
  let temporary=null
  try {
    const first=a.noiseSrc(), second=a.noiseSrc()
    assert(first!==second,'noise sources are independent')
    assert(first.buffer===second.buffer,'noise buffer is shared')
    assert(first.loop===true&&second.loop===true,'noise sources loop')
    assert(first.buffer.length===first.buffer.sampleRate,'noise buffer is one second')
    const samples=first.buffer.getChannelData(0)
    let hasPositive=false,hasNegative=false
    for(const sample of samples){hasPositive ||= sample>0;hasNegative ||= sample<0;if(hasPositive&&hasNegative)break}
    assert(hasPositive&&hasNegative,'noise contains positive and negative samples')
    first.disconnect();second.disconnect()
    temporary=new (window.AudioContext || window.webkitAudioContext)()
    a.ctx=temporary
    const other=a.noiseSrc()
    assert(other.buffer!==first.buffer,'different context gets isolated buffer')
    assert(a.noiseBufferCtx===temporary,'cache tracks current context')
    other.disconnect()
  } finally {
    a.ctx=originalCtx
    a.noiseBufferCtx=originalBufferCtx
    a.noiseBuffer=originalBuffer
    if(temporary)await temporary.close()
  }
  return {passed:checks.length,checks}
}
