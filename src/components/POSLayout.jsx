import { useState, useEffect } from "react"
import { C, PAGE_BG } from "./posTheme.js"
import { Brand, GhostButton } from "./ui.jsx"
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
    <div style={{ display: "flex", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
      {opts.map((o) => {
        const on = view === o.key
        return (
          <button key={o.key} onClick={() => setView(o.key)} style={{
            height: 26, padding: "0 12px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 11.5, fontWeight: 500,
            background: on ? C.raised : "transparent", color: on ? C.white : C.soft,
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
    <div style={{ height: "100vh", background: PAGE_BG, display: "flex", flexDirection: "column", color: C.text, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", background: "rgba(11,14,20,0.6)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Brand size={28} />
          <div style={{ width: 1, height: 20, background: C.line2 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: C.white, letterSpacing: "-0.02em" }}>{BRAND.name}</div>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.accent,
            border: `1px solid ${C.accentLine}`, padding: "4px 10px", borderRadius: 999,
          }}>{assist.enabled ? "In-Store" : BRAND.location}</div>
          <ViewToggle view={view} setView={setView} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {pos.loyaltyId && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", color: C.accent, border: `1px solid ${C.accentLine}`, padding: "3px 4px 3px 10px", borderRadius: 999 }}>
              ★ Member ••{pos.loyaltyId.slice(-4)}
              <button onClick={() => pos.setLoyaltyId(null)} aria-label="Remove loyalty member" style={{ background: "transparent", border: "none", color: C.soft, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 4px", fontFamily: "inherit" }}>×</button>
            </div>
          )}
          <div style={{ textAlign: "right", lineHeight: 1.15 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: C.white, letterSpacing: "-0.02em" }}>{pos.timeStr}</div>
            <div style={{ fontSize: 11, color: C.soft }}>{pos.dateStr}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: pos.printerOnline ? C.success : C.danger, boxShadow: `0 0 8px ${pos.printerOnline ? C.success : C.danger}` }} />
            <span style={{ fontSize: 11.5, color: C.muted }}>{pos.printerOnline ? "Printer" : "Printer offline"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
            <span style={{ fontSize: 11.5, color: C.muted }}>Live</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, borderLeft: `1px solid ${C.line2}`, paddingLeft: 18 }}>
            <span style={{ color: C.white }}>{user.name}</span> · {user.role}
          </div>
          <GhostButton onClick={pos.handleLogout} style={{ height: 34, fontSize: 12.5 }}>Sign out</GhostButton>
        </div>
      </div>

      {/* Body — the selected view (shares the same order) */}
      {/* In an In-Store demo room, items out today carry an "Out today" mark (Vavoom Assist) */}
      {view === "legacy" ? <LegacyView pos={pos} outIds={assist.enabled ? assist.hot.outIds : null} /> : <ModernView pos={pos} outIds={assist.enabled ? assist.hot.outIds : null} />}

      {/* Vavoom Assist's floating upsell square + transcript (In-Store demo rooms only) */}
      {assist.enabled ? <AssistOverlay assist={assist} /> : null}

      {/* Footer */}
      <div style={{
        padding: "8px 20px", borderTop: `1px solid ${C.line}`, background: C.bg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 10.5, color: C.faint }}>{user.name} · {user.shift} shift</div>
        <div style={{ fontSize: 10.5, color: C.faint }}>Vavoom POS · Demo v1.0 · {BRAND.footer}</div>
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
