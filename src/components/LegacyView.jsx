// LegacyView — classic touchscreen-terminal POS: order ticket (Description / Qty /
// Price / Amount) + totals + numeric keypad + function buttons on the left, a dense
// colour-coded item grid on the right. Body only; header/modals/toggle live in
// POSLayout. State comes from the shared usePos() hook (so it shares the modern
// view's cart).
import { C, fmt, catColor } from "./posTheme.js"
import { AssistMarks, OutBadge } from "./ModernView.jsx"

function ItemBtn({ item, color, count, onClick, out }) {
  const prices = Object.values(item.sizes)
  const min = Math.min(...prices)
  const multi = prices.length > 1
  return (
    <button
      onClick={() => onClick(item)}
      style={{
        position: "relative", background: color, border: "none", borderRadius: 8,
        padding: "8px 8px 7px", cursor: "pointer", fontFamily: "inherit", color: "#fff",
        textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: 62, boxShadow: count > 0 ? `0 0 0 2px ${C.lime}` : "inset 0 -2px 0 rgba(0,0,0,0.22)",
        transition: "transform 0.08s", opacity: out ? 0.6 : 1,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {count > 0 && (
        <span style={{
          position: "absolute", top: -7, right: -7, background: C.lime, color: C.limeText,
          minWidth: 19, height: 19, borderRadius: 10, padding: "0 5px",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11,
        }}>{count}</span>
      )}
      {out ? <OutBadge /> : null}
      <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.18, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
        {item.name}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.95 }}>
        {multi ? "from " : ""}{fmt(min)}
      </span>
    </button>
  )
}

function Fn({ label, sub, onClick, disabled, color = C.navyCard, fg = C.text }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? C.navyMid : color, color: disabled ? C.textMuted : fg,
        border: `1px solid ${C.navyBorder}`, borderRadius: 8, cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "0 6px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
        minHeight: 44,
      }}
    >
      <span>{label}</span>
      {sub ? <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{sub}</span> : null}
    </button>
  )
}

function Key({ label, onClick, accent, wide }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: accent ? `${C.lime}1f` : C.navyCard,
        color: accent ? C.lime : C.text,
        border: `1px solid ${accent ? C.lime + "55" : C.navyBorder}`,
        borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        fontWeight: 800, fontSize: 16, minHeight: 44, gridColumn: wide ? "span 2" : "auto",
      }}
    >{label}</button>
  )
}

function Row({ label, value, muted, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
      <span style={{ fontSize: strong ? 13 : 12, color: muted ? C.textSec : C.text, fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, color: muted ? C.textSec : C.text, fontWeight: strong ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}

// outIds: item ids Vavoom Assist has on today's out-of-stock list (In-Store demo rooms only).
export default function LegacyView({ pos, outIds }) {
  const {
    category, setCategory, items, CATEGORIES, cart, selectedKey, setSelectedKey, cartCountFor,
    handleItemClick, voidLine, clearAll, hold, recall, holds,
    entry, pressDigit, backspace, clearEntry, applyQty, applyDiscount, discountPct,
    subtotal, discount, tax, total, itemCount, orderId, setShowPayment, success, handlePrintReceipt,
  } = pos

  const selected = cart.find((e) => e.key === selectedKey)

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", background: C.navy }}>

      {/* ── LEFT: ticket + totals + keypad ─────────────────────────────── */}
      <div style={{ width: "53%", minWidth: 500, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.navyBorder}`, background: C.navyMid }}>

        {/* ticket meta */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.navyBorder}`, fontSize: 11, color: C.textSec }}>
          <span>Order <span style={{ color: C.text, fontWeight: 700 }}>#{orderId}</span></span>
          <span>Items <span style={{ color: C.text, fontWeight: 700 }}>{itemCount}</span></span>
        </div>

        {/* column header */}
        <div style={{ display: "flex", padding: "6px 12px", background: C.navyCard, borderBottom: `1px solid ${C.navyBorder}`, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: C.textSec, textTransform: "uppercase" }}>
          <span style={{ flex: 1 }}>Description</span>
          <span style={{ width: 46, textAlign: "center" }}>Qty</span>
          <span style={{ width: 66, textAlign: "right" }}>Price</span>
          <span style={{ width: 72, textAlign: "right" }}>Amount</span>
        </div>

        {/* line items */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {cart.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 12 }}>
              No items — tap a product, or select a line and use the keypad
            </div>
          ) : (
            cart.map((e) => {
              const on = e.key === selectedKey
              const sizeLabel = e.size !== "each" && e.size !== "bottle" ? ` (${e.size})` : ""
              return (
                <div key={e.key} onClick={() => setSelectedKey(e.key)} style={{
                  display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer",
                  borderBottom: `1px solid ${C.navyBorder}`,
                  background: on ? `${C.lime}14` : "transparent",
                  boxShadow: on ? `inset 3px 0 0 ${C.lime}` : "none",
                }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.item.name}<span style={{ color: C.textSec, fontWeight: 500 }}>{sizeLabel}</span><AssistMarks via={e.via} />
                  </span>
                  <span style={{ width: 46, textAlign: "center", fontSize: 13, fontWeight: 800, color: on ? C.lime : C.text }}>{e.count}</span>
                  <span style={{ width: 66, textAlign: "right", fontSize: 12, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{fmt(e.price)}</span>
                  <span style={{ width: 72, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmt(e.price * e.count)}</span>
                </div>
              )
            })
          )}
        </div>

        {/* totals */}
        <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.navyBorder}`, background: C.navyCard }}>
          <Row label="Amount" value={fmt(subtotal)} muted />
          <Row label={`Discount (${discountPct.toFixed(2)}%)`} value={`-${fmt(discount)}`} muted />
          <Row label="Tax · G.S.T. (13%)" value={fmt(tax)} muted />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.navyBorder}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>TOTAL</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: C.lime, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
          </div>
        </div>

        {/* keypad entry strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", borderTop: `1px solid ${C.navyBorder}` }}>
          <span style={{ fontSize: 11, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? `Selected: ${selected.item.name}` : "Select a line to edit qty"}
          </span>
          <span style={{ minWidth: 64, textAlign: "right", fontSize: 16, fontWeight: 800, color: entry ? C.lime : C.textMuted, fontVariantNumeric: "tabular-nums", background: C.navy, border: `1px solid ${C.navyBorder}`, borderRadius: 6, padding: "2px 8px" }}>
            {entry || "0"}
          </span>
        </div>

        {/* functions + keypad */}
        <div style={{ display: "flex", gap: 8, padding: "0 12px 8px" }}>
          {/* function column */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1, minWidth: 0, alignContent: "start" }}>
            <Fn label="Void" onClick={voidLine} disabled={!selectedKey} color="#3a1620" fg={C.danger} />
            <Fn label="Clear" onClick={clearAll} disabled={!cart.length} />
            <Fn label="Hold" onClick={hold} disabled={!cart.length} />
            <Fn label="Recall" sub={holds.length ? `${holds.length} held` : ""} onClick={recall} disabled={!holds.length} />
            <Fn label="Reprint" onClick={handlePrintReceipt} disabled={!success} />
            <Fn label="No Disc" onClick={() => pos.setDiscountPct(0)} disabled={!discountPct} />
          </div>

          {/* numeric keypad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 50px)", gap: 6 }}>
            <Key label="7" onClick={() => pressDigit("7")} />
            <Key label="8" onClick={() => pressDigit("8")} />
            <Key label="9" onClick={() => pressDigit("9")} />
            <Key label="Qty" accent onClick={applyQty} />
            <Key label="4" onClick={() => pressDigit("4")} />
            <Key label="5" onClick={() => pressDigit("5")} />
            <Key label="6" onClick={() => pressDigit("6")} />
            <Key label="%" accent onClick={applyDiscount} />
            <Key label="1" onClick={() => pressDigit("1")} />
            <Key label="2" onClick={() => pressDigit("2")} />
            <Key label="3" onClick={() => pressDigit("3")} />
            <Key label="⌫" onClick={backspace} />
            <Key label="0" onClick={() => pressDigit("0")} />
            <Key label="00" onClick={() => pressDigit("00")} />
            <Key label="C" onClick={clearEntry} />
            <Key label="↵" accent onClick={applyQty} />
          </div>
        </div>

        {/* payment bar */}
        <div style={{ padding: "0 12px 12px" }}>
          <button
            onClick={() => setShowPayment(true)}
            disabled={!cart.length}
            style={{
              width: "100%", padding: "14px 18px", borderRadius: 10, border: "none",
              background: cart.length ? C.lime : C.navyBorder, color: cart.length ? C.limeText : C.textMuted,
              fontWeight: 900, fontSize: 16, cursor: cart.length ? "pointer" : "default", fontFamily: "inherit",
              letterSpacing: "0.01em", display: "flex", justifyContent: "space-between",
            }}
          >
            <span>PAYMENT</span><span>{fmt(total)}</span>
          </button>
        </div>
      </div>

      {/* ── RIGHT: category tabs + item grid ───────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, borderBottom: `1px solid ${C.navyBorder}`, flexShrink: 0 }}>
          {CATEGORIES.map((cat) => {
            const on = category === cat
            const col = catColor(cat)
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                fontWeight: 800, fontSize: 12, color: "#fff",
                background: col, border: on ? `2px solid ${C.lime}` : "2px solid transparent",
                opacity: on ? 1 : 0.62,
              }}>{cat}</button>
            )
          })}
        </div>
        <div style={{
          flex: 1, overflowY: "auto", padding: 10, display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 7, alignContent: "start",
        }}>
          {items.map((item) => (
            <ItemBtn key={item.id} item={item} color={catColor(category)} count={cartCountFor(item)} onClick={(it) => handleItemClick(it, category)} out={!!outIds?.includes(item.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
