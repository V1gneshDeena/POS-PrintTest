// ModernView — the card-grid POS (default look). Body only; the header, modals and
// view toggle live in POSLayout. All state comes from the shared usePos() hook.
import { CATEGORY_ICONS, TAG_CONFIG } from "../data/catalog.js"
import { C, fmt } from "./posTheme.js"

function TagPill({ tag }) {
  const cfg = TAG_CONFIG[tag]
  if (!cfg) return null
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 20,
      background: cfg.bg, color: cfg.color, textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  )
}

// Vavoom Assist's out-of-stock list for today (In-Store demo rooms only). The tile stays
// tappable: the cashier has the last word, and Assist offers the closest substitute.
export function OutBadge() {
  return (
    <span style={{
      position: "absolute", top: -7, left: -6, background: C.danger, color: "#fff", fontSize: 9, fontWeight: 800,
      padding: "2px 6px", borderRadius: 6, letterSpacing: "0.04em", textTransform: "uppercase", pointerEvents: "none",
    }}>Out today</span>
  )
}

function MenuCard({ item, category, cartCount, onClick, out }) {
  const sizes = Object.values(item.sizes)
  const minPrice = Math.min(...sizes)
  const hasMultiple = sizes.length > 1
  return (
    <div
      onClick={() => onClick(item, category)}
      style={{
        background: C.navyCard,
        border: `1px solid ${cartCount > 0 ? C.lime + "55" : C.navyBorder}`,
        borderRadius: 14, padding: "13px 13px 11px", cursor: "pointer",
        transition: "border-color 0.15s, transform 0.1s", position: "relative", userSelect: "none",
        opacity: out ? 0.6 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.lime + "88")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = cartCount > 0 ? C.lime + "55" : C.navyBorder)}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {cartCount > 0 && (
        <div style={{
          position: "absolute", top: -8, right: -8, background: C.lime, color: C.limeText,
          width: 22, height: 22, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 12, lineHeight: 1,
        }}>{cartCount}</div>
      )}
      {out ? <OutBadge /> : null}
      <div style={{ fontSize: 26, marginBottom: 7, lineHeight: 1 }}>{CATEGORY_ICONS[category] || "☕"}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3, marginBottom: 8, minHeight: 32 }}>
        {item.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.lime }}>
          {hasMultiple ? "from " : ""}{fmt(minPrice)}
        </span>
        <TagPill tag={item.tag} />
      </div>
    </div>
  )
}

// Marks units Vavoom Assist added: 🎙 from what the customer said, ★ from an accepted upsell.
export function AssistMarks({ via }) {
  if (!via || (!via.voice && !via.upsell)) return null
  return (
    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.03em" }}>
      {via.voice ? <span style={{ color: "#60A5FA" }} title="Added from what the customer said">🎙 heard{via.voice > 1 ? ` ×${via.voice}` : ""} </span> : null}
      {via.upsell ? <span style={{ color: C.lime }} title="Added from an accepted upsell">★ upsell{via.upsell > 1 ? ` ×${via.upsell}` : ""}</span> : null}
    </span>
  )
}

function CartRow({ entry, onAdd, onRemove }) {
  const { item, size, price, count, category } = entry
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.navyBorder}` }}>
      <span style={{ fontSize: 18, width: 26, textAlign: "center", flexShrink: 0 }}>{CATEGORY_ICONS[category] || "☕"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        <div style={{ fontSize: 11, color: C.textSec }}>
          {size !== "each" && size !== "bottle" ? size : ""} · {fmt(price)}<AssistMarks via={entry.via} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onRemove(entry.key)} style={{
          width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.navyBorder}`,
          background: "transparent", color: C.textSec, cursor: "pointer", fontSize: 15,
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", lineHeight: 1,
        }}>−</button>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text, minWidth: 16, textAlign: "center" }}>{count}</span>
        <button onClick={() => onAdd(entry)} style={{
          width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.lime}44`,
          background: `${C.lime}15`, color: C.lime, cursor: "pointer", fontSize: 15,
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", lineHeight: 1,
        }}>+</button>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 44, textAlign: "right", flexShrink: 0 }}>{fmt(price * count)}</span>
    </div>
  )
}

// outIds: item ids Vavoom Assist has on today's out-of-stock list (In-Store demo rooms only).
export default function ModernView({ pos, outIds }) {
  const {
    category, setCategory, items, CATEGORIES, cart, cartCountFor, handleItemClick,
    incrementFromCart, decrementFromCart, subtotal, tax, total, itemCount, orderId,
    setShowPayment, clearAll,
  } = pos

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left: Menu */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: `1px solid ${C.navyBorder}`, overflowX: "auto", flexShrink: 0 }}>
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 600, fontSize: 12, whiteSpace: "nowrap",
              background: category === cat ? C.lime : C.navyCard,
              color: category === cat ? C.limeText : C.textSec, transition: "all 0.15s", flexShrink: 0,
            }}>{CATEGORY_ICONS[cat]} {cat}</button>
          ))}
        </div>
        <div style={{
          flex: 1, overflowY: "auto", padding: 16, display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, alignContent: "start",
        }}>
          {items.map((item) => (
            <MenuCard key={item.id} item={item} category={category} cartCount={cartCountFor(item)} onClick={handleItemClick} out={!!outIds?.includes(item.id)} />
          ))}
        </div>
      </div>

      {/* Right: Cart */}
      <div style={{ width: 300, borderLeft: `1px solid ${C.navyBorder}`, background: C.navyMid, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.navyBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Order
            {itemCount > 0 && (
              <span style={{ marginLeft: 8, background: C.lime, color: C.limeText, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 10 }}>{itemCount}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>#{orderId}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "2px 18px" }}>
          {cart.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: 0.5 }}>
              <div style={{ fontSize: 32 }}>☕</div>
              <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center" }}>Tap an item to add it</div>
            </div>
          ) : (
            cart.map((entry) => (
              <CartRow key={entry.key} entry={entry} onAdd={incrementFromCart} onRemove={decrementFromCart} />
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.navyBorder}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textSec, marginBottom: 5 }}>
              <span>Subtotal</span><span style={{ color: C.text }}>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textSec, marginBottom: 12 }}>
              <span>Tax (13%)</span><span style={{ color: C.text }}>{fmt(tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.navyCard, borderRadius: 10, padding: "11px 14px", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: 20, color: C.lime }}>{fmt(total)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={clearAll} style={{
                padding: "12px 12px", borderRadius: 10, border: `1px solid ${C.navyBorder}`, background: "transparent",
                color: C.textSec, fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}>Clear</button>
              <button onClick={() => setShowPayment(true)} style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "none", background: C.lime, color: C.limeText,
                fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em",
              }}>Charge {fmt(total)}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
