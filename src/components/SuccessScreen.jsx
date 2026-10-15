import { useState } from "react"
import { BRAND } from "../data/catalog.js"
import { C, fmt, PAGE_BG } from "./posTheme.js"
import { ArrowPill, Eyebrow, GhostButton } from "./ui.jsx"

const METHOD_LABELS = {
  card: "Credit / Debit Card",
  cash: "Cash",
  apple: "Apple Pay",
  tap: "Tap to Pay",
}

export default function SuccessScreen({ method, total, orderId, onNew, onPrint, printerOnline }) {
  const [printing, setPrinting] = useState(false)
  const [printResult, setPrintResult] = useState(null)

  const handlePrint = async () => {
    if (!onPrint) return
    setPrinting(true)
    setPrintResult(null)
    const result = await onPrint()
    setPrintResult(result)
    setPrinting(false)
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: PAGE_BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", zIndex: 300, textAlign: "center", padding: 24,
    }}>
      {/* Tick */}
      <div style={{
        width: 76, height: 76, borderRadius: "50%", background: C.accentSoft, border: `1px solid ${C.accentLine}`,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 26, boxShadow: `0 0 40px ${C.accentGlow}`,
      }}>
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <path d="M7 15.5l5.2 5.2L23 9.8" fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <Eyebrow style={{ marginBottom: 10 }}>Payment complete · order #{orderId}</Eyebrow>
      <div style={{ fontSize: 64, fontWeight: 500, color: C.white, letterSpacing: "-0.05em", lineHeight: 1, marginBottom: 10 }}>
        {fmt(total)}
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>
        {METHOD_LABELS[method] || method} · {BRAND.name}, {BRAND.location}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <GhostButton onClick={handlePrint} disabled={printing || !printerOnline} style={{ height: 52, padding: "0 22px", fontSize: 14 }}>
          {printing ? "Printing…" : printerOnline ? "Print receipt" : "Printer offline"}
        </GhostButton>
        <ArrowPill big onClick={onNew}>Start new order</ArrowPill>
      </div>

      {/* Print result feedback */}
      {printResult && (
        <div style={{ fontSize: 12.5, color: printResult.success ? C.accent : C.danger }}>
          {printResult.success ? "Receipt printed" : `Not printed: ${printResult.error}`}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.faint, marginTop: 18 }}>
        Thank you — {BRAND.thankYou.charAt(0).toLowerCase() + BRAND.thankYou.slice(1)}
      </div>
    </div>
  )
}
