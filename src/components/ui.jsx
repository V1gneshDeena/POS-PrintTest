// ui.jsx — the vavoom.io building blocks the POS screens share (posTheme.js has the palette):
//   VavoomMark   the Vavoom mark (the paths of the TV's public/vavoomlogo.svg) in a lime rounded square
//   Brand        the mark + "Vavoom" wordmark, as in vavoom.io's header
//   Eyebrow      small uppercase label above a heading or a group
//   ArrowPill    the main action: a white pill with a lime circle and arrow ("Book a demo ●")
//   GhostButton  a quiet secondary action with a hairline border
//   ItemThumb    an item's photo (menuPhotos.js), or its initials on a raised tile when it has none
import { C } from "./posTheme.js"
import { photoFor } from "../data/menuPhotos.js"

export function VavoomMark({ size = 26 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: size * 0.28, background: C.accent, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={size * 0.62} height={size * 0.62 * (409 / 617)} viewBox="0 0 617 409" aria-hidden="true">
        <path fill={C.accentInk} d="M513.503 2.55271C522.298 -2.04162 534.893 -1.09038 536.881 10.8535C537.326 13.5268 536.398 16.224 535.016 18.5547C494.122 87.4791 472.544 129.911 507.637 156.421C509.785 158.043 512.403 158.907 515.086 159.12L604.006 166.191C606.609 166.398 609.193 167.174 611.182 168.867C619.975 176.355 617.642 184.919 611.82 191.182C609.53 193.645 606.027 194.666 602.663 194.711C434.951 196.926 467.208 178.08 354.189 399.939C353.233 401.817 351.894 403.629 350.147 404.808C337.158 413.571 325.813 404.577 324.298 395.82C323.967 393.905 324.599 392.03 325.462 390.289C348.933 342.903 392.21 252.169 393.576 248.168C400.377 228.253 388.097 203.634 366.396 195.889C363.655 194.91 360.734 194.604 357.824 194.543L301.993 193.367C299.087 193.306 296.105 192.57 294.212 190.364C289.983 185.436 288.71 177.873 291.367 171.782C293.046 167.934 297.675 166.65 301.869 166.823C480.477 174.203 458.87 85.7388 509.381 6.57908C510.428 4.93793 511.777 3.45412 513.503 2.55271Z" />
        <path fill={C.accentInk} d="M119.795 14.5176C211.454 25.6579 226.424 135.658 319.119 296.244C331.892 318.372 333.084 345.543 321.227 368.175L320.646 369.281C308.222 392.995 281.786 408.198 261.375 390.874C180.33 322.087 112.905 66.9173 68.9297 48.0898L0 14.5176H119.795Z" />
      </svg>
    </span>
  )
}

export function Brand({ size = 26 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <VavoomMark size={size} />
      <span style={{ fontSize: size * 0.62, fontWeight: 500, letterSpacing: "-0.03em", color: C.white }}>Vavoom</span>
    </span>
  )
}

export function Eyebrow({ children, style }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.soft, ...style }}>
      {children}
    </div>
  )
}

export function ArrowPill({ children, onClick, disabled, type = "button", style, big }) {
  const h = big ? 52 : 44
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 14,
      height: h, padding: `0 ${h * 0.14}px 0 ${h * 0.46}px`, borderRadius: 999, border: "none",
      background: disabled ? C.raised : C.white, color: disabled ? C.faint : C.accentInk,
      fontFamily: "inherit", fontSize: big ? 16 : 14, fontWeight: 500, letterSpacing: "-0.02em",
      cursor: disabled ? "default" : "pointer", transition: "transform 0.1s, background 0.2s", whiteSpace: "nowrap",
      ...style,
    }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)" }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
    >
      <span>{children}</span>
      <span style={{
        width: h - 14, height: h - 14, borderRadius: "50%", flexShrink: 0,
        background: disabled ? C.line2 : C.accentInk, display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 7h8M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke={disabled ? C.faint : C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  )
}

export function GhostButton({ children, onClick, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: 40, padding: "0 16px", borderRadius: 999, border: `1px solid ${C.line2}`, background: "transparent",
      color: C.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: disabled ? "default" : "pointer",
      transition: "border-color 0.15s, color 0.15s", whiteSpace: "nowrap", ...style,
    }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = C.accentLine; e.currentTarget.style.color = C.white } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line2; e.currentTarget.style.color = C.muted }}
    >{children}</button>
  )
}

const initials = (name) => String(name || "").replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()

/** The item's photo, or its initials when the menu has no photo for it. `ratio` is width / height. */
export function ItemThumb({ item, ratio = 4 / 3, radius = 10, style }) {
  const src = photoFor(item)
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: String(ratio), borderRadius: radius, overflow: "hidden",
      background: C.raised, flexShrink: 0, containerType: "inline-size", ...style,
    }}>
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: C.soft, fontWeight: 500, letterSpacing: "-0.02em", fontSize: "clamp(11px, 28cqw, 26px)",
          background: `radial-gradient(circle at 30% 20%, ${C.accentGlow}, transparent 70%), ${C.raised}`,
        }}>{initials(item?.name)}</div>
      )}
    </div>
  )
}
