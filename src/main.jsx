import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { startPresence } from './demoPresence.js'
import { isFullBarView } from './assist/assistSync.js'
import { BRAND, syncRoomMenu } from './data/catalog.js'
import { fetchDemoConfig, getDemoId } from './assist/demoContext.js'

// The tab title names the menu's brand (generic "Demo Restaurant" on the burger menu).
document.title = `${BRAND.name} POS — Vavoom`

// Report this POS — or, with ?view=assist, Vavoom Assist's full bar — as live to the
// demo-console health screen (no-op without ?demo=).
startPresence(isFullBarView() ? 'assist' : 'pos')

// In a demo room, the room's own menu decides (catalog.js): remembered for the next load, and a
// wrong guess on this load is corrected with one reload.
if (getDemoId()) fetchDemoConfig().then((cfg) => syncRoomMenu(getDemoId(), cfg))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
