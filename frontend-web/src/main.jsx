import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import { EditGateProvider } from './editing.jsx'
import { registerServiceWorker } from './serviceWorker.js'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Real paths, not hashes: Django answers every one of them with the same
        shell, so a reload or a deep link lands where it should. */}
    <BrowserRouter>
      <AuthProvider>
        {/* Inside the auth provider, because logging out is one of the three
            things that ends an arming. */}
        <EditGateProvider>
          <App />
        </EditGateProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

registerServiceWorker()
