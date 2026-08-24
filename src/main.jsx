import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ProvedorSessao } from './ctx/Sessao'
import App from './App'
import './estilo.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProvedorSessao>
      <App />
    </ProvedorSessao>
  </StrictMode>
)
