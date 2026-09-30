import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { useEffect, type ReactNode } from 'react'
import './index.css'
import { failBoot, finishBoot } from './boot'

function ReadyGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => finishBoot())
    return () => cancelAnimationFrame(frame)
  }, [])
  return children
}

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
          <ReadyGate>
            <App />
          </ReadyGate>
        </BrowserRouter>,
      )
    })
    .catch(failBoot)
}
