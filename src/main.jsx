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
// BASE_URL makes this work both at the domain root and under /NatureFit/.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
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
