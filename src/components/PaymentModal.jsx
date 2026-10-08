import { useState } from "react"
import { C, fmt } from "./posTheme.js"
import { ArrowPill, Eyebrow, GhostButton } from "./ui.jsx"

const METHODS = [
  { key: "card", label: "Card", sub: "Credit or debit" },
  { key: "cash", label: "Cash", sub: "Notes and coins" },
  { key: "apple", label: "Apple Pay", sub: "Phone or watch" },
  { key: "tap", label: "Tap to Pay", sub: "Contactless" },
]

export default function PaymentModal({ subtotal, discount = 0, tax, total, onClose, onComplete }) {
  const [method, setMethod] = useState(null)
  const [processing, setProcessing] = useState(false)

  const handleCharge = () => {
    if (!method) return
    setProcessing(true)
    setTimeout(() => onComplete(method), 1600)
  }

  const row = { display: "flex", justifyContent: "space-between", fontSize: 13, color: C.soft, marginBottom: 6 }
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,7,10,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 22, padding: 24,
          width: "100%", maxWidth: 380, boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <Eyebrow style={{ marginBottom: 6 }}>Payment</Eyebrow>
        <div style={{ fontSize: 24, fontWeight: 500, color: C.white, marginBottom: 18, letterSpacing: "-0.035em" }}>
          How is the customer paying?
        </div>

        {/* Summary */}
        <div style={{ background: C.inset, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
          <div style={row}><span>Subtotal</span><span style={{ color: C.text }}>{fmt(subtotal)}</span></div>
          {discount > 0 && <div style={row}><span>Discount</span><span style={{ color: C.text }}>-{fmt(discount)}</span></div>}
          <div style={{ ...row, marginBottom: 10 }}><span>Tax (13%)</span><span style={{ color: C.text }}>{fmt(tax)}</span></div>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Eyebrow>Total</Eyebrow>
            <span style={{ fontSize: 28, fontWeight: 500, color: C.white, letterSpacing: "-0.04em" }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Methods */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          {METHODS.map((m) => {
            const on = method === m.key
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                style={{
                  background: on ? C.accentSoft : C.inset, border: `1px solid ${on ? C.accent : C.line}`, borderRadius: 14,
                  padding: "13px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: on ? C.accent : C.white, letterSpacing: "-0.01em" }}>{m.label}</div>
                <div style={{ fontSize: 11, color: C.soft, marginTop: 2 }}>{m.sub}</div>
              </button>
            )
          })}
        </div>

        <ArrowPill big onClick={handleCharge} disabled={!method || processing} style={{ width: "100%" }}>
          {processing ? "Processing…" : `Charge ${fmt(total)}`}
        </ArrowPill>
        <GhostButton onClick={onClose} style={{ marginTop: 10, width: "100%" }}>Cancel</GhostButton>
      </div>
    </div>
  )
}
