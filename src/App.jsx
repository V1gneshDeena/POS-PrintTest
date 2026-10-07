import { useState, useEffect } from "react"
import AuthScreen from "./components/AuthScreen.jsx"
import POSLayout from "./components/POSLayout.jsx"
import PosMirror from "./components/PosMirror.jsx"
import { loadSession } from "./data/auth.js"
import { isPosFollower } from "./posSync.js"
import AssistFullBar from "./assist/AssistFullBar.jsx"
import { isFullBarView } from "./assist/assistSync.js"

export default function App() {
  // Vavoom Assist's full bar (?view=assist): its own page, no POS login — it shows the
  // state the POS publishes (assist/assistSync.js).
  if (isFullBarView()) return <AssistFullBar />
  // Follower mode (the /screens viewer): mirror the live order read-only — no login.
  if (isPosFollower()) return <PosMirror />
  return <LeaderApp />
}

function LeaderApp() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Restore the operator for this session if one already typed their name
    const saved = loadSession()
    if (saved?.name) setUser(saved)
    setReady(true)
  }, [])

  if (!ready) return null

  if (!user) {
    return <AuthScreen onLogin={setUser} />
  }

  return <POSLayout user={user} onLogout={() => setUser(null)} />
}
