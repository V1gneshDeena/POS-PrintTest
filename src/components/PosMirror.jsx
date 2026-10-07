// PosMirror — read-only view of the live POS order, for embedding in the /screens
// viewer (loaded as ?sync=follower). Shows whatever the real POS (leader) is ringing
// up, received over the same-origin BroadcastChannel. No login, no interaction.
import { useEffect, useState } from "react"
import { C, fmt } from "./posTheme.js"
import { onOrder } from "../posSync.js"

export default function PosMirror() {
  const [snap, setSnap] = useState(null)
  useEffect(() => onOrder(setSnap), [])

  const cart = snap?.cart || []

  return (
    <div style={{ height: "100vh", background: C.navy, color: C.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: C.navyMid, borderBottom: `1px solid ${C.navyBorder}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: C.lime, color: C.limeText, fontWeight: 900, fontSize: 12, padding: "4px 9px", borderRadius: 7 }}>VAVOOM</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>POS · Live Order</div>
        </div>
        <div style={{ fontSize: 12, color: C.textSec }}>
          {snap ? <>{snap.operator || "—"} · <span style={{ color: C.textMuted }}>#{snap.orderId}</span></> : "connecting…"}
        </div>
      </div>

      {/* column header */}
      <div style={{ display: "flex", padding: "8px 18px", background: C.navyCard, borderBottom: `1px solid ${C.navyBorder}`, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: C.textSec, textTransform: "uppercase" }}>
        <span style={{ flex: 1 }}>Description</span>
        <span style={{ width: 50, textAlign: "center" }}>Qty</span>
        <span style={{ width: 70, textAlign: "right" }}>Price</span>
        <span style={{ width: 78, textAlign: "right" }}>Amount</span>
      </div>

      {/* lines */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {cart.length === 0 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 13 }}>
            {snap ? "No items on the order yet" : "Waiting for the POS…"}
          </div>
        ) : (
          cart.map((e, i) => {
            const sizeLabel = e.size && e.size !== "each" && e.size !== "bottle" ? ` (${e.size})` : ""
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 18px", borderBottom: `1px solid ${C.navyBorder}` }}>
                <span style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name}<span style={{ color: C.textSec, fontWeight: 500 }}>{sizeLabel}</span>
                </span>
                <span style={{ width: 50, textAlign: "center", fontSize: 14, fontWeight: 800 }}>{e.count}</span>
                <span style={{ width: 70, textAlign: "right", fontSize: 13, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{fmt(e.price)}</span>
                <span style={{ width: 78, textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(e.price * e.count)}</span>
              </div>
            )
          })
        )}
      </div>

      {/* totals */}
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.navyBorder}`, background: C.navyCard, flexShrink: 0 }}>
        <Row label="Amount" value={fmt(snap?.subtotal)} muted />
        {snap?.discountPct > 0 && <Row label={`Discount (${snap.discountPct.toFixed(2)}%)`} value={`-${fmt(snap.discount)}`} muted />}
        <Row label="Tax · G.S.T. (13%)" value={fmt(snap?.tax)} muted />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.navyBorder}` }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>TOTAL</span>
          <span style={{ fontSize: 26, fontWeight: 900, color: C.lime, fontVariantNumeric: "tabular-nums" }}>{fmt(snap?.total)}</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span style={{ fontSize: 13, color: muted ? C.textSec : C.text }}>{label}</span>
      <span style={{ fontSize: 13.5, color: muted ? C.textSec : C.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}
