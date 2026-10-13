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
    })
    .catch(failBoot)
}
