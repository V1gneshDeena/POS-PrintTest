const C = {
  navy: "#0B0E14",
  navyMid: "#141920",
  navyCard: "#1A2130",
  navyBorder: "#252E3D",
  lime: "#CFFF2F",
  limeText: "#0B0E14",
  text: "#F0F4FF",
  textSec: "#7B8BAD",
}

const fmt = (n) => `$${n.toFixed(2)}`

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
          maxWidth: 360,
        }}
      >
        <div style={{ marginBottom: 6, fontSize: 11, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {category}
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.text, marginBottom: 20, letterSpacing: "-0.02em" }}>
          {item.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {sizes.map(([size, price]) => (
            <button
              key={size}
              onClick={() => onConfirm(item, size, price)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                background: C.navyMid,
                border: `1px solid ${C.navyBorder}`,
                borderRadius: 12,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.lime + "88"
                e.currentTarget.style.background = C.lime + "0F"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.navyBorder
                e.currentTarget.style.background = C.navyMid
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{size}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: C.lime }}>{fmt(price)}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: 10,
            border: `1px solid ${C.navyBorder}`,
            background: "transparent",
            color: C.textSec,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >Cancel</button>
      </div>
    </div>
  )
}
