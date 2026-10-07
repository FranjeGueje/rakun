import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, poster } from './api/bridge'
import { WebLink } from './api/link'
import App from './App'
import './styles.css'

/** The page comes from rakun, which puts its token in a `<meta>` */
const token =
  document.querySelector('meta[name="rakun-token"]')?.getAttribute('content') ??
  ''
const root = document.getElementById('root') as HTMLElement

if (!token) {
  root.textContent =
    'This page has to be opened from rakun (http://127.0.0.1:17370).'
} else {
  const link = new WebLink(token)
  window.rakun = createBridge(link, poster(token))
  link.start()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
