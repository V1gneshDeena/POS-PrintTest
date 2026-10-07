import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { startPresence } from './demoPresence.js'
import { isFullBarView } from './assist/assistSync.js'

// Report this POS — or, with ?view=assist, Vavoom Assist's full bar — as live to the
// demo-console health screen (no-op without ?demo=).
startPresence(isFullBarView() ? 'assist' : 'pos')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
