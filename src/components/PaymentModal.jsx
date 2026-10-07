import { useState } from "react"

const C = {
  navyMid: "#141920",
  navyCard: "#1A2130",
  navyBorder: "#252E3D",
  lime: "#CFFF2F",
  limeText: "#0B0E14",
  text: "#F0F4FF",
  textSec: "#7B8BAD",
  textMuted: "#4A566B",
}

const fmt = (n) => `$${n.toFixed(2)}`

const METHODS = [
  { key: "card",   label: "Card",       icon: "💳" },
  { key: "cash",   label: "Cash",       icon: "💵" },
  { key: "apple",  label: "Apple Pay",  icon: "🍎" },
  { key: "tap",    label: "Tap to Pay", icon: "📱" },
]

export default function PaymentModal({ subtotal, discount = 0, tax, total, onClose, onComplete }) {
  const [method, setMethod] = useState(null)
  const [processing, setProcessing] = useState(false)

  const handleCharge = () => {
    if (!method) return
    setProcessing(true)
    setTimeout(() => onComplete(method), 1600)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "#00000099",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.navyCard,
          border: `1px solid ${C.navyBorder}`,
          borderRadius: 20,
          padding: 28,
          width: "100%",
          maxWidth: 340,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 20, letterSpacing: "-0.02em" }}>
          Select Payment Method
        </div>

        {/* Summary */}
        <div style={{
          background: C.navyMid, borderRadius: 12, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textSec, marginBottom: 5 }}>
            <span>Subtotal</span><span style={{ color: C.text }}>{fmt(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textSec, marginBottom: 5 }}>
              <span>Discount</span><span style={{ color: C.text }}>-{fmt(discount)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textSec, marginBottom: 10 }}>
            <span>Tax (13%)</span><span style={{ color: C.text }}>{fmt(tax)}</span>
          </div>
          <div style={{
            borderTop: `1px solid ${C.navyBorder}`,
            paddingTop: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.lime }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Methods */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              style={{
                background: method === m.key ? `${C.lime}18` : C.navyMid,
                border: `1.5px solid ${method === m.key ? C.lime : C.navyBorder}`,
                borderRadius: 12,
                padding: "12px 8px",
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: method === m.key ? C.lime : C.textSec }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleCharge}
          disabled={!method || processing}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: method && !processing ? C.lime : C.navyBorder,
            color: method && !processing ? C.limeText : C.textMuted,
            fontWeight: 800, fontSize: 15, cursor: method && !processing ? "pointer" : "default",
            transition: "all 0.2s", fontFamily: "inherit",
          }}
        >{processing ? "Processing..." : `Charge ${fmt(total)}`}</button>

        <button
          onClick={onClose}
          style={{
            marginTop: 10, width: "100%", padding: "11px", borderRadius: 10,
            border: `1px solid ${C.navyBorder}`, background: "transparent",
            color: C.textSec, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}
        >Cancel</button>
      </div>
    </div>
  )
}
