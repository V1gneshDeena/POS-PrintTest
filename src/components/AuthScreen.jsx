import { useState } from "react"
import { makeOperator, saveSession } from "../data/auth.js"

const C = {
  navy: "#0B0E14",
  navyMid: "#141920",
  navyCard: "#1A2130",
  navyBorder: "#252E3D",
  lime: "#CFFF2F",
  limeText: "#0B0E14",
  text: "#F0F4FF",
  textSec: "#7B8BAD",
}

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
      minHeight: "100vh",
      background: C.navy,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grid pattern */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${C.navyBorder}44 1px, transparent 1px), linear-gradient(90deg, ${C.navyBorder}44 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
        opacity: 0.4,
      }} />

      {/* Lime glow */}
      <div style={{
        position: "absolute",
        width: 400, height: 400,
        background: `radial-gradient(circle, ${C.lime}14 0%, transparent 70%)`,
        top: "10%", left: "50%", transform: "translateX(-50%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 460,
      }}>
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}>
            <div style={{
              background: C.lime,
              color: C.limeText,
              fontWeight: 900,
              fontSize: 14,
              padding: "6px 12px",
              borderRadius: 8,
              letterSpacing: "-0.02em",
            }}>VAVOOM</div>
            <div style={{ color: C.navyBorder, fontSize: 18 }}>×</div>
            <div style={{ color: C.textSec, fontWeight: 600, fontSize: 14 }}>Gregory's Coffee</div>
          </div>
          <h1 style={{
            color: C.text,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            marginBottom: 6,
          }}>Who's on the window?</h1>
          <p style={{ color: C.textSec, fontSize: 14 }}>Type your name to start — it prints on every receipt</p>
        </div>

        {/* Name bar */}
        <form onSubmit={handleSubmit} style={{
          background: C.navyCard,
          border: `1px solid ${C.navyBorder}`,
          borderRadius: 20,
          padding: 24,
          display: "flex",
          gap: 12,
        }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name, e.g. Dave"
            autoFocus
            maxLength={40}
            style={{
              flex: 1,
              padding: "14px 16px",
              background: C.navyMid,
              border: `1px solid ${C.navyBorder}`,
              borderRadius: 12,
              color: C.text,
              fontSize: 17,
              outline: "none",
              transition: "border-color 0.2s",
              fontFamily: "inherit",
            }}
            onFocus={(e) => e.target.style.borderColor = C.lime + "88"}
            onBlur={(e) => e.target.style.borderColor = C.navyBorder}
          />
          <button
            type="submit"
            disabled={!trimmed}
            style={{
              padding: "14px 26px",
              borderRadius: 12,
              border: "none",
              background: trimmed ? C.lime : C.navyBorder,
              color: trimmed ? C.limeText : C.textSec,
              fontWeight: 800,
              fontSize: 15,
              cursor: trimmed ? "pointer" : "default",
              transition: "all 0.2s",
              fontFamily: "inherit",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >Start Shift</button>
        </form>
      </div>
    </div>
  )
}
