// ModernView — the card-grid POS (default look), in vavoom.io's style (posTheme.js, ui.jsx).
// Body only; the header, modals and view toggle live in POSLayout. All state comes from the
// shared usePos() hook. Each tile shows the item's photo (menuPhotos.js; the item's initials when
// the menu has none), its name, its price ("Free" for the $0 toppings and mix-ins) and its tag.
import { TAG_CONFIG } from "../data/catalog.js"
import { C, fmt, fmtPrice } from "./posTheme.js"
import { ArrowPill, Eyebrow, GhostButton, ItemThumb } from "./ui.jsx"

// The item's tag, as a chip on the bottom-left of its photo: bestseller / popular in the accent,
// any other tag in white, both on a dark glass so they read over any photo.
function TagPill({ tag }) {
  const cfg = TAG_CONFIG[tag]
  if (!cfg) return null
  const loud = tag === "bestseller" || tag === "popular"
  return (
    <span style={{
      position: "absolute", left: 8, bottom: 8, zIndex: 1,
      fontSize: 9, fontWeight: 500, letterSpacing: "0.1em", padding: "4px 8px", borderRadius: 999,
      textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none",
      background: "rgba(11,14,20,0.72)", backdropFilter: "blur(6px)", color: loud ? C.accent : C.white,
      border: `1px solid ${loud ? C.accentLine : C.line2}`,
    }}>{cfg.label}</span>
  )
}

// Vavoom Assist's out-of-stock list for today (In-Store demo rooms only). The tile stays
// tappable: the cashier has the last word, and Assist offers the closest substitute.
export function OutBadge() {
  return (
    <span style={{
      position: "absolute", top: 14, left: 14, zIndex: 1, background: C.danger, color: C.accentInk, fontSize: 9, fontWeight: 600,
      padding: "3px 8px", borderRadius: 999, letterSpacing: "0.08em", textTransform: "uppercase", pointerEvents: "none",
    }}>Out today</span>
  )
}

function MenuCard({ item, cartCount, onClick, out, category }) {
  const sizes = Object.values(item.sizes)
  const minPrice = Math.min(...sizes)
  const hasMultiple = sizes.length > 1
  const rest = cartCount > 0 ? C.accentLine : C.line
  return (
    <div
      onClick={() => onClick(item, category)}
      style={{
        background: C.surface, border: `1px solid ${rest}`, borderRadius: 16, padding: 7, cursor: "pointer",
        transition: "border-color 0.15s, transform 0.12s", position: "relative", userSelect: "none",
        opacity: out ? 0.55 : 1, display: "flex", flexDirection: "column",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accentLine; e.currentTarget.style.transform = "translateY(-1px)" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = rest; e.currentTarget.style.transform = "none" }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
    >
      {cartCount > 0 && (
        <div style={{
          position: "absolute", top: 13, right: 13, zIndex: 1, background: C.accent, color: C.accentInk,
          minWidth: 24, height: 24, padding: "0 7px", borderRadius: 999, boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12,
        }}>{cartCount}</div>
      )}
      {out ? <OutBadge /> : null}
      <div style={{ position: "relative" }}>
        <ItemThumb item={item} radius={11} />
        {out ? null : <TagPill tag={item.tag} />}
      </div>
      <div style={{ padding: "10px 5px 4px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: C.white, lineHeight: 1.25, letterSpacing: "-0.02em", minHeight: 34 }}>
          {item.name}
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: minPrice ? C.text : C.accent, letterSpacing: "-0.02em", marginTop: "auto" }}>
          {hasMultiple ? <span style={{ color: C.soft, fontSize: 11 }}>from </span> : null}{fmtPrice(minPrice)}
        </span>
      </div>
    </div>
  )
}

// Marks units Vavoom Assist added: 🎙 from what the customer said, ★ from an accepted upsell.
export function AssistMarks({ via }) {
  if (!via || (!via.voice && !via.upsell)) return null
  return (
    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 600, letterSpacing: "0.03em" }}>
      {via.voice ? <span style={{ color: "#60A5FA" }} title="Added from what the customer said">🎙 heard{via.voice > 1 ? ` ×${via.voice}` : ""} </span> : null}
      {via.upsell ? <span style={{ color: C.lime }} title="Added from an accepted upsell">★ upsell{via.upsell > 1 ? ` ×${via.upsell}` : ""}</span> : null}
    </span>
  )
}

const roundBtn = (accent) => ({
  width: 26, height: 26, borderRadius: "50%", border: `1px solid ${accent ? C.accentLine : C.line2}`,
  background: accent ? C.accentSoft : "transparent", color: accent ? C.accent : C.muted, cursor: "pointer", fontSize: 15,
  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", lineHeight: 1,
})

function CartRow({ entry, onAdd, onRemove }) {
  const { item, size, price, count } = entry
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ width: 42 }}><ItemThumb item={item} ratio={1} radius={9} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.white, letterSpacing: "-0.015em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        <div style={{ fontSize: 11.5, color: C.soft }}>
          {size !== "each" && size !== "bottle" ? `${size} · ` : ""}{fmtPrice(price)}<AssistMarks via={entry.via} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onRemove(entry.key)} style={roundBtn(false)}>−</button>
        <span style={{ fontWeight: 500, fontSize: 13, color: C.white, minWidth: 16, textAlign: "center" }}>{count}</span>
        <button onClick={() => onAdd(entry)} style={roundBtn(true)}>+</button>
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text, minWidth: 48, textAlign: "right", flexShrink: 0 }}>{fmt(price * count)}</span>
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
        <div style={{ display: "flex", gap: 6, padding: "14px 20px", borderBottom: `1px solid ${C.line}`, overflowX: "auto", flexShrink: 0 }}>
          {CATEGORIES.map((cat) => {
            const on = category === cat
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                height: 34, padding: "0 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                fontWeight: 500, fontSize: 13, letterSpacing: "-0.01em", whiteSpace: "nowrap", flexShrink: 0,
                border: `1px solid ${on ? C.accent : C.line2}`, background: on ? C.accent : "transparent",
                color: on ? C.accentInk : C.muted, transition: "all 0.15s",
              }}>{cat}</button>
            )
          })}
        </div>
        <div style={{
          flex: 1, overflowY: "auto", padding: 20, display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(156px, 1fr))", gap: 12, alignContent: "start",
        }}>
          {items.map((item) => (
            <MenuCard key={item.id} item={item} category={category} cartCount={cartCountFor(item)} onClick={handleItemClick} out={!!outIds?.includes(item.id)} />
          ))}
        </div>
      </div>

      {/* Right: the ticket */}
      <div style={{ width: 330, borderLeft: `1px solid ${C.line}`, background: C.inset, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <Eyebrow>Current order · #{orderId}</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: C.white, letterSpacing: "-0.035em" }}>Order</span>
            {itemCount > 0 && <span style={{ fontSize: 13, color: C.accent }}>{itemCount} item{itemCount === 1 ? "" : "s"}</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "2px 20px" }}>
          {cart.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, textAlign: "center" }}>
              <Eyebrow>No items yet</Eyebrow>
              <div style={{ fontSize: 13, color: C.faint }}>Tap an item to add it</div>
            </div>
          ) : (
            cart.map((entry) => (
              <CartRow key={entry.key} entry={entry} onAdd={incrementFromCart} onRemove={decrementFromCart} />
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div style={{ padding: "16px 20px 18px", borderTop: `1px solid ${C.line}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.soft, marginBottom: 6 }}>
              <span>Subtotal</span><span style={{ color: C.text }}>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.soft, marginBottom: 14 }}>
              <span>Tax (13%)</span><span style={{ color: C.text }}>{fmt(tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
              <Eyebrow>Total</Eyebrow>
              <span style={{ fontWeight: 500, fontSize: 30, color: C.white, letterSpacing: "-0.04em" }}>{fmt(total)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <GhostButton onClick={clearAll} style={{ height: 52 }}>Clear</GhostButton>
              <ArrowPill big onClick={() => setShowPayment(true)} style={{ flex: 1 }}>Charge {fmt(total)}</ArrowPill>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
