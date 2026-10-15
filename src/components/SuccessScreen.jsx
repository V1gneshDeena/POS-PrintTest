import { useState } from "react"

const C = {
  navyCard: "#1A2130",
  navyBorder: "#252E3D",
  lime: "#CFFF2F",
  limeText: "#0B0E14",
  text: "#F0F4FF",
  textSec: "#7B8BAD",
  textMuted: "#4A566B",
  success: "#22C55E",
  danger: "#EF4444",
}

const fmt = (n) => `$${n.toFixed(2)}`

const METHOD_LABELS = {
  card: "Credit / Debit Card",
  cash: "Cash",
  apple: "Apple Pay",
  tap: "Tap to Pay",
}

export default function SuccessScreen({ method, total, orderId, onNew, onPrint, printerOnline, autoPrintResult }) {
  const [printing, setPrinting] = useState(false)
  const [manualResult, setPrintResult] = useState(null)
  const printResult = manualResult || autoPrintResult

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
      position: "fixed", inset: 0, background: "#0B0E14F5",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 300, gap: 0,
    }}>
      {/* Checkmark */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: `${C.lime}18`,
        border: `2px solid ${C.lime}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, marginBottom: 24,
      }}>✓</div>

      <div style={{ fontSize: 26, fontWeight: 900, color: C.lime, letterSpacing: "-0.03em", marginBottom: 6 }}>
        Payment Complete
      </div>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 6 }}>
        Order #{orderId}
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.text, letterSpacing: "-0.03em", marginBottom: 6 }}>
        {fmt(total)}
      </div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 30 }}>
        {METHOD_LABELS[method] || method}
      </div>

      {/* Receipt summary card */}
      <div style={{
        background: C.navyCard,
        border: `1px solid ${C.navyBorder}`,
        borderRadius: 16,
        padding: "14px 20px",
        marginBottom: 24,
        textAlign: "center",
        minWidth: 260,
      }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Gregory's Coffee · Old Bridge Drive-Thru
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
          Thank you — have a great day! ☕
        </div>
      </div>

      {/* Print receipt button */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          onClick={handlePrint}
          disabled={printing || !printerOnline}
          style={{
            background: printerOnline ? C.navyCard : C.navyBorder,
            color: printerOnline ? C.text : C.textMuted,
            border: `1px solid ${printerOnline ? C.navyBorder : C.navyBorder}`,
            padding: "12px 24px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            cursor: printerOnline && !printing ? "pointer" : "default",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s",
          }}
        >
          🖨️ {printing ? "Printing..." : printerOnline ? "Print Receipt" : "Printer Offline"}
        </button>
      </div>

      {/* Print result feedback */}
      {printResult && (
        <div style={{
          fontSize: 12,
          color: printResult.success ? C.success : C.danger,
          marginBottom: 16,
        }}>
          {printResult.success ? "✓ Receipt printed!" : `✗ ${printResult.error}`}
        </div>
      )}

      <button
        onClick={onNew}
        style={{
          background: C.lime,
          color: C.limeText,
          border: "none",
          padding: "14px 40px",
          borderRadius: 12,
          fontWeight: 800,
          fontSize: 16,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "-0.01em",
        }}
      >Start New Order</button>
    </div>
  )
}
