// useDraggable.js — a floating box the cashier can drag by its handle.
//
// Position is kept per box in localStorage (vavoom-assist-pos-<key>) so it stays where
// it was put across reloads, and is clamped back on screen when the window shrinks.
// Returns { pos, handleProps, boxRef }: spread handleProps on the drag handle, put
// boxRef on the box, and position the box with `left: pos.x, top: pos.y`.

import { useCallback, useEffect, useRef, useState } from "react"

function load(key, fallback) {
  try {
    const p = JSON.parse(localStorage.getItem(`vavoom-assist-pos-${key}`) || "null")
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p
  } catch { /* private mode */ }
  return typeof fallback === "function" ? fallback() : fallback
}

export function useDraggable(key, fallback) {
  const [pos, setPos] = useState(() => load(key, fallback))
  const boxRef = useRef(null)
  const drag = useRef(null)

  const clamp = useCallback((p) => {
    const el = boxRef.current
    const w = el?.offsetWidth || 200
    const h = el?.offsetHeight || 80
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
    }
  }, [])

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p))
    window.addEventListener("resize", onResize)
    onResize()
    return () => window.removeEventListener("resize", onResize)
  }, [clamp])

  useEffect(() => {
    try { localStorage.setItem(`vavoom-assist-pos-${key}`, JSON.stringify(pos)) } catch { /* private mode */ }
  }, [key, pos])

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest("button, a, input")) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }))
  }
  const onPointerUp = () => { drag.current = null }

  return {
    pos,
    boxRef,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, style: { cursor: "grab", touchAction: "none" } },
  }
}
