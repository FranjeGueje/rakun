import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBridge, poster } from './api/bridge'
import { WebLink } from './api/link'
import App from './App'
import './styles.css'

/** The page comes from relicd, which puts its token in a `<meta>` */
const token =
  document
    .querySelector('meta[name="relicd-token"]')
    ?.getAttribute('content') ?? ''
const root = document.getElementById('root') as HTMLElement

if (!token) {
  root.textContent =
    'This page has to be opened from relicd (http://127.0.0.1:17370).'
} else {
  const link = new WebLink(token)
  window.relicd = createBridge(link, poster(token))
  link.start()
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
