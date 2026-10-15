// useDraggable.js — a floating box the cashier can drag by its handle.
//
// Position is kept per box in localStorage (vavoom-assist-pos-<key>) so it stays where
// it was put across reloads, and is clamped back on screen when the window shrinks.
// Returns { pos, handleProps, boxRef, reclamp }: spread handleProps on the drag handle, put
// boxRef on the box, and position the box with `left: pos.x, top: pos.y`; reclamp() pulls it
// back on screen after the box changed size.
//
// useScale(key) makes a box bigger or smaller (David, 2026-10-08: "stretch the card to get bigger
// or shrink it to get smaller", on the tablet and the computer): spread gripProps on a corner grip;
// dragging it out or in scales the box between 0.8× and 2.4× (never wider than the window), with
// mouse, pen or finger (pointer events). Double-click or double-tap the grip for 1×. Kept per box
// in localStorage (vavoom-assist-scale-<key>).

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

  const reclamp = useCallback(() => setPos((p) => clamp(p)), [clamp])

  return {
    pos,
    boxRef,
    reclamp,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, style: { cursor: "grab", touchAction: "none" } },
  }
}

const SCALE_MIN = 0.8
const SCALE_MAX = 2.4

export function useScale(key, base = 300) {
  const fit = useCallback((v) => Math.min(Math.max(SCALE_MIN, v), SCALE_MAX, Math.max(SCALE_MIN, (window.innerWidth - 16) / base)), [base])
  const [scale, setScale] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem(`vavoom-assist-scale-${key}`))
      if (Number.isFinite(v)) return Math.min(Math.max(SCALE_MIN, v), SCALE_MAX)
    } catch { /* private mode */ }
    return 1
  })
  const start = useRef(null)
  const lastTap = useRef(0)

  useEffect(() => {
    try { localStorage.setItem(`vavoom-assist-scale-${key}`, String(scale)) } catch { /* private mode */ }
  }, [key, scale])
  useEffect(() => {
    const onResize = () => setScale((v) => fit(v))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [fit])

  const onPointerDown = (e) => {
    // A second tap within 350 ms: back to 1× (a double-tap on a tablet, a double-click on the computer).
    if (Date.now() - lastTap.current < 350) { setScale(1); lastTap.current = 0; e.preventDefault(); return }
    lastTap.current = Date.now()
    start.current = { x: e.clientX, y: e.clientY, s: scale }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }
  const onPointerMove = (e) => {
    if (!start.current) return
    // Out and down grows the box, in and up shrinks it: the larger of the two movements counts.
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy
    setScale(fit(start.current.s + d / base))
  }
  const onPointerUp = () => { start.current = null }

  return {
    scale,
    gripProps: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
      title: "Drag to make the card bigger or smaller · double-tap for the normal size",
      style: { touchAction: "none", cursor: "nwse-resize" },
    },
  }
}

