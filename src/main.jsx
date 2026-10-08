import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA service worker registration + gentle update flow.
// vite-plugin-pwa 'autoUpdate' registers and updates silently; we keep an
// eye out for a waiting worker and show a non-intrusive banner via postMessage.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      // Notify the app when a new version is waiting (user refreshes when ready)
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (installing) {
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('naturefit-update-ready'))
            }
          })
        }
      })
    } catch {
      // SW registration failed — the app still works as a normal website
    }
  })
}
