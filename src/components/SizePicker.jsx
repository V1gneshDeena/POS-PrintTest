import { C, fmt } from "./posTheme.js"
import { Eyebrow, GhostButton, ItemThumb } from "./ui.jsx"

export default function SizePicker({ item, category, onConfirm, onClose }) {
  const sizes = Object.entries(item.sizes)
  const hasSingleSize = sizes.length === 1

  if (hasSingleSize) {
    // Single-size items skip the modal and confirm immediately
    const [size, price] = sizes[0]
    onConfirm(item, size, price)
    return null
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,7,10,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 22, padding: 10,
          width: "100%", maxWidth: 380, boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <ItemThumb item={item} ratio={16 / 9} radius={15} />
        <div style={{ padding: "16px 14px 14px" }}>
          <Eyebrow style={{ marginBottom: 6 }}>{category} · choose a size</Eyebrow>
          <div style={{ fontSize: 24, fontWeight: 500, color: C.white, marginBottom: 16, letterSpacing: "-0.035em" }}>
            {item.name}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {sizes.map(([size, price]) => (
              <button
                key={size}
                onClick={() => onConfirm(item, size, price)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", height: 52, padding: "0 20px",
                  background: C.inset, border: `1px solid ${C.line}`, borderRadius: 999, cursor: "pointer",
                  transition: "all 0.15s", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accentLine; e.currentTarget.style.background = C.accentSoft }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.inset }}
              >
                <span style={{ fontSize: 15, fontWeight: 500, color: C.white, letterSpacing: "-0.01em" }}>{size}</span>
                <span style={{ fontSize: 16, fontWeight: 500, color: C.accent, letterSpacing: "-0.02em" }}>{fmt(price)}</span>
              </button>
            ))}
          </div>

          <GhostButton onClick={onClose} style={{ width: "100%" }}>Cancel</GhostButton>
        </div>
      </div>
    </div>
  )
}
