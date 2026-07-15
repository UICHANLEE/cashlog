import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountApp } from './AccountApp'
import './account.css'

createRoot(document.getElementById('root')!).render(<StrictMode><AccountApp /></StrictMode>)
