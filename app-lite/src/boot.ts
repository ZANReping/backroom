declare global {
  interface Window {
    __bootSlowTimer?: number
  }
}

const clearBootTimer = () => {
  if (window.__bootSlowTimer === undefined) return
  window.clearTimeout(window.__bootSlowTimer)
  delete window.__bootSlowTimer
}

let failed = false
let removeTimer: number | undefined

export function finishBoot() {
  if (failed) return
  clearBootTimer()
  const loader = document.getElementById('boot-loader')
  if (!loader) return
  loader.dataset.state = 'ready'
  loader.setAttribute('aria-hidden', 'true')
  loader.style.pointerEvents = 'none'
  removeTimer = window.setTimeout(() => loader.remove(), 200)
}

export function failBoot(error: unknown) {
  failed = true
  window.clearTimeout(removeTimer)
  clearBootTimer()
  console.error('Boot failed', error)

  const loader = document.getElementById('boot-loader')
  if (loader) {
    loader.dataset.state = 'error'
    loader.setAttribute('aria-hidden', 'false')
    loader.style.pointerEvents = ''
  }

  const status = document.getElementById('boot-status')
  if (status) status.textContent = '入口连接失败，请重试。'

  const retry = document.getElementById('boot-retry') as HTMLButtonElement | null
  if (retry) {
    retry.hidden = false
    retry.removeAttribute('aria-hidden')
    retry.onclick = () => window.location.reload()
  }
}

export {}
