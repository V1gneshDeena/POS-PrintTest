import { useState } from "react"
import { makeOperator, saveSession } from "../data/auth.js"
import { BRAND } from "../data/catalog.js"
import { C, PAGE_BG } from "./posTheme.js"
import { ArrowPill, Brand, Eyebrow } from "./ui.jsx"

/**
 * Not a login — just a name bar. The operator types their name and is in.
 * The name rides on every printed receipt ("Operator: <name>") so the
 * interceptor can attribute upsells on the leaderboard.
 */
export default function AuthScreen({ onLogin }) {
  const [name, setName] = useState("")
  const trimmed = name.trim()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!trimmed) return
    const user = makeOperator(trimmed)
    saveSession(user)
    onLogin(user)
  }

  return (
    <div style={{
      minHeight: "100vh", background: PAGE_BG, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 24, left: 28 }}><Brand size={30} /></div>

      <div style={{ position: "relative", width: "100%", maxWidth: 520 }}>
        <Eyebrow style={{ marginBottom: 14 }}>{BRAND.name} · point of sale</Eyebrow>
        <h1 style={{ color: C.white, fontSize: 44, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.05, marginBottom: 12 }}>
          Who's on the <span style={{ color: C.accent }}>window</span>?
        </h1>
        <p style={{ color: C.muted, fontSize: 15, marginBottom: 28 }}>Type your name to start. It prints on every receipt.</p>

        <form onSubmit={handleSubmit} style={{
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: 6,
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name, e.g. Dave"
            autoFocus
            maxLength={40}
            style={{
              flex: 1, minWidth: 0, height: 52, padding: "0 22px", background: "transparent", border: "none",
              color: C.white, fontSize: 17, outline: "none", fontFamily: "inherit", letterSpacing: "-0.01em",
            }}
          />
          <ArrowPill big type="submit" disabled={!trimmed}>Start shift</ArrowPill>
        </form>
      </div>
    </div>
  )
}
