import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { failBoot } from './boot'

const rootElement = document.getElementById('root')
if (!rootElement) {
  failBoot(new Error('Missing root element'))
} else {
  import('./App.tsx')
    .then(({ default: App }) => {
      createRoot(rootElement, {
        onUncaughtError: (error) => failBoot(error),
      }).render(
        <BrowserRouter>
          <App />
        </BrowserRouter>,
      )
      // v68：空闲时预载复古人物贴图池（脸/衣物/发丝小图），档案肖像与 NPC 首次出现时即可直接用
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
      idle(() => { void import('./game/renderer/retroAvatar').then((m) => m.preloadRetroAvatarTextures()) })
    })
    .catch(failBoot)
}
