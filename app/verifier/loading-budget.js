export async function verifyLoadingBudget() {
  const {renderer:r,engine:e}=perfQA,checks=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const {default:SettingsModal,createDefaultSettings,GRAPHICS_PRESETS}=await import('/src/components/SettingsModal.tsx')
  assert(createDefaultSettings(true).loadingBudgetMs===4&&createDefaultSettings(false).loadingBudgetMs===6,'mobile and desktop loading defaults are separate from the active budget')
  assert(['performance','balanced','immersive','mobile'].map(k=>GRAPHICS_PRESETS[k].loadingBudgetMs).join() === '4,6,8,4','all presets specify a loading budget')
  const saved={chunkBudgetMs:2,renderScale:77},merged={...createDefaultSettings(true),...saved}
  assert(merged.chunkBudgetMs===2&&merged.renderScale===77&&merged.loadingBudgetMs===4,'older saved settings retain their values and gain the missing loading default')
  const React=(await import('react')).default, {createRoot}=await import('react-dom/client'), {flushSync}=await import('react-dom')
  const host=document.createElement('div'); document.body.appendChild(host)
  let domSettings=createDefaultSettings(true)
  let domChanges=0
  const root=createRoot(host)
  const renderSettings=()=>root.render(React.createElement(SettingsModal,{settings:domSettings,onChange:(next)=>{domSettings=next;domChanges++;renderSettings()},onClose:()=>{}}))
  try {
    flushSync(renderSettings)
    const tab=(text)=>[...host.querySelectorAll('button')].find(button=>button.textContent?.trim()===text)
    flushSync(()=>tab('画面')?.click()); flushSync(()=>tab('性能')?.click())
    const label=[...host.querySelectorAll('label')].find(node=>node.textContent?.includes('入场加载每帧预算'))
    const input=label?.querySelector('input[type="range"]')
    assert(!!input&&input.min==='1'&&input.max==='8'&&input.step==='0.5'&&input.value==='4','settings DOM exposes the mobile loading budget range with default 4')
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set
    flushSync(()=>{setter?.call(input,'5.5'); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}))})
    assert(domSettings.loadingBudgetMs===5.5&&domSettings.chunkBudgetMs===1.5&&domChanges>0,'settings DOM updates loading budget without changing gameplay budget')
  } finally { root.unmount(); host.remove() }
  await perfQA.measure(5,5)
  const sync=r.syncInfinite,ready=r.isNearWorldReady,oldPaused=e.paused,oldActive=r.chunkBudgetMs,oldLoading=r.loadingBudgetMs,budgets=[]
  try{
    r.setChunkBudget(1.5);r.setLoadingBudget(4)
    r.syncInfinite=function(_m,_def,_p,budget){budgets.push(budget)}
    for(const paused of [false,true])for(const near of [false,true]){
      e.paused=paused;r.isNearWorldReady=()=>near
      r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
      assert(budgets.at(-1)===(paused&&!near?4:1.5),`paused=${paused}, nearReady=${near}: only entry waiting uses the larger budget`)
    }
    for(const [input,want] of [[0,1],[100,8],[NaN,6]]){r.setLoadingBudget(input);assert(r.loadingBudgetMs===want,`invalid/out-of-range loading budget ${input} normalizes`)}
    assert(r.chunkBudgetMs===1.5,'changing the loading budget never changes the active gameplay budget')
  }finally{r.syncInfinite=sync;r.isNearWorldReady=ready;e.paused=oldPaused;r.setChunkBudget(oldActive);r.setLoadingBudget(oldLoading)}
  return {passed:checks.length,checks}
}
