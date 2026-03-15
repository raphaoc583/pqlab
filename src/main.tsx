import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadRuntimeConfig, getRuntimeConfig } from './lib/config'
import { initFirebaseFromConfig } from './lib/firebase'

async function bootstrap() {
  await loadRuntimeConfig()
  initFirebaseFromConfig(getRuntimeConfig().firebase)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
