import { useState, useEffect } from "react"
import { C } from "./posTheme.js"
import { BRAND } from "../data/catalog.js"
import { usePos } from "./usePos.js"
import ModernView from "./ModernView.jsx"
import LegacyView from "./LegacyView.jsx"
import SizePicker from "./SizePicker.jsx"
import PaymentModal from "./PaymentModal.jsx"
import SuccessScreen from "./SuccessScreen.jsx"
import AssistOverlay from "../assist/AssistOverlay.jsx"
import { useAssist } from "../assist/useAssist.js"

const VIEW_KEY = "vavoom_pos_view"

function ViewToggle({ view, setView }) {
  const opts = [
    { key: "modern", label: "Modern" },
    { key: "legacy", label: "Classic" },
  ]
  return (
    <div style={{ display: "flex", background: C.navyCard, border: `1px solid ${C.navyBorder}`, borderRadius: 9, padding: 2 }}>
      {opts.map((o) => {
        const on = view === o.key
        return (
          <button key={o.key} onClick={() => setView(o.key)} style={{
            padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 11, fontWeight: 700,
            background: on ? C.lime : "transparent", color: on ? C.limeText : C.textSec,
            transition: "all 0.15s",
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

export default function POSLayout({ user, onLogout }) {
  const pos = usePos(user, onLogout)
  // Vavoom Assist — only in an In-Store demo room (?demo= whose config is productType
  // "instore", or ?assist=1); everywhere else `enabled` stays false and nothing renders.
  // On screen it is two draggable boxes (upsell square + transcript); the rest is the
  // full bar page (?view=assist).
  const assist = useAssist(pos)
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || "modern")
  useEffect(() => { localStorage.setItem(VIEW_KEY, view) }, [view])

  return (
    <div style={{ height: "100vh", background: C.navy, display: "flex", flexDirection: "column", color: C.text, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", background: C.navyMid, borderBottom: `1px solid ${C.navyBorder}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: C.lime, color: C.limeText, fontWeight: 900, fontSize: 12, padding: "4px 9px", borderRadius: 7, letterSpacing: "-0.02em" }}>VAVOOM</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{BRAND.name}</div>
          <div style={{ fontSize: 10, color: C.textMuted, background: C.navyCard, padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.navyBorder}` }}>{assist.enabled ? "In-Store" : BRAND.location}</div>
          <ViewToggle view={view} setView={setView} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 12, color: C.textSec }}>{pos.dateStr}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{pos.timeStr}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: pos.printerOnline ? C.success : C.danger }} />
            <span style={{ fontSize: 11, color: pos.printerOnline ? C.success : C.danger, fontWeight: 600 }}>
              {pos.printerOnline ? "Printer" : "Printer Offline"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.success }} />
            <span style={{ fontSize: 11, color: C.success, fontWeight: 600 }}>Live</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, borderLeft: `1px solid ${C.navyBorder}`, paddingLeft: 16 }}>
            {user.name} · <span style={{ color: C.lime }}>{user.role}</span>
          </div>
          <button onClick={pos.handleLogout} style={{
            background: "transparent", border: `1px solid ${C.navyBorder}`, color: C.textSec,
            fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
          }}>Sign Out</button>
        </div>
      </div>

      {/* Body — the selected view (shares the same order) */}
      {/* In an In-Store demo room, items out today carry an "Out today" mark (Vavoom Assist) */}
      {view === "legacy" ? <LegacyView pos={pos} outIds={assist.enabled ? assist.hot.outIds : null} /> : <ModernView pos={pos} outIds={assist.enabled ? assist.hot.outIds : null} />}

      {/* Vavoom Assist's floating upsell square + transcript (In-Store demo rooms only) */}
      {assist.enabled ? <AssistOverlay assist={assist} /> : null}

      {/* Footer */}
      <div style={{
        padding: "8px 20px", borderTop: `1px solid ${C.navyBorder}`, background: C.navyMid, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 10, color: C.textMuted }}>{user.name} · {user.shift} Shift</div>
        <div style={{ fontSize: 10, color: C.textMuted }}>Vavoom POS · Demo v1.0 · {BRAND.footer}</div>
      </div>

      {/* Shared modals */}
      {pos.sizePicker && (
        <SizePicker
          item={pos.sizePicker.item}
          category={pos.sizePicker.category}
          onConfirm={(item, size, price) => pos.addToCart(item, size, price, pos.sizePicker.category)}
          onClose={() => pos.setSizePicker(null)}
        />
      )}
      {pos.showPayment && (
        <PaymentModal
          subtotal={pos.subtotal} discount={pos.discount} tax={pos.tax} total={pos.total}
          onClose={() => pos.setShowPayment(false)}
          onComplete={pos.handleComplete}
        />
      )}
      {pos.success && (
        <SuccessScreen
          method={pos.success.method}
          total={pos.success.total}
          orderId={pos.success.orderId}
          onNew={pos.handleNewOrder}
          onPrint={pos.handlePrintReceipt}
          printerOnline={pos.printerOnline}
          autoPrintResult={pos.success.printResult}
        />
      )}
    </div>
  )
}
