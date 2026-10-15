// usePos — the single source of truth for a POS session (cart, totals, keypad,
// payment, print, sync). Both the modern and legacy views render this same state,
// so toggling between them keeps the in-progress order intact.
//
// Every screen action is also emitted on the activity bus (../assist/activity.js) for
// Vavoom Assist's behaviour model; with Assist off nobody listens. Cart lines carry
// `via` counts ({ voice, upsell }) of units Assist added from speech or from an
// accepted upsell, so the views can mark them.
import { useState, useEffect, useRef } from "react"
import { clearSession } from "../data/auth.js"
import { MENU } from "../data/catalog.js"
import { TAX_RATE, fmtOrderId } from "./posTheme.js"
import { syncOrderToVavoom } from "../services/vavoom-sync.js"
import { printReceipt, checkPrinterStatus } from "../services/printer.js"
import { listenForScans, matchScan } from "../services/scanner.js"
import { broadcastOrder, onHello } from "../posSync.js"
import { emitActivity } from "../assist/activity.js"

const CATEGORIES = Object.keys(MENU)

export function usePos(user, onLogout) {
  const [category, _setCategory] = useState(CATEGORIES[0])
  const [cart, setCart] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [entry, setEntry] = useState("")          // keypad buffer (legacy view)
  const [discountPct, setDiscountPct] = useState(0)
  const [holds, setHolds] = useState([])          // parked tickets (legacy view)
  const [sizePicker, setSizePicker] = useState(null)
  const [showPayment, _setShowPayment] = useState(false)
  const [success, setSuccess] = useState(null)
  const [orderNum, setOrderNum] = useState(1042)
  const [time, setTime] = useState(new Date())
  const [printerOnline, setPrinterOnline] = useState(false)
  const [loyaltyId, setLoyaltyId] = useState(null)  // scanned loyalty card

  const orderId = fmtOrderId(orderNum)
  const items = MENU[category] || []

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Printer status on mount + every 30s.
  useEffect(() => {
    const check = async () => setPrinterOnline((await checkPrinterStatus()).online)
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const cartKey = (item, size) => `${item.id}__${size}`
  const cartCountFor = (item) =>
    cart.filter((e) => e.item.id === item.id).reduce((s, e) => s + e.count, 0)

  // Screen navigation and payment open/close go through these so Assist sees them.
  const setCategory = (cat) => {
    _setCategory(cat)
    emitActivity({ type: "category_view", category: cat })
  }
  const setShowPayment = (open) => {
    _setShowPayment(open)
    emitActivity({ type: open ? "payment_open" : "payment_cancel" })
  }

  // source: "cashier" (a tap), or "voice" / "upsell" when Vavoom Assist adds it.
  const addToCart = (item, size, price, cat, source = "cashier") => {
    const key = cartKey(item, size)
    if (source === "cashier") { setSelectedKey(key); setEntry("") }
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.key === key)
      const via = (v) => (source === "cashier" ? v : { ...v, [source]: (v[source] || 0) + 1 })
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], count: next[idx].count + 1, via: via(next[idx].via || {}) }
        return next
      }
      return [...prev, { key, item, size, price, count: 1, category: cat, via: via({}) }]
    })
    if (source === "cashier") setSizePicker(null)
    emitActivity({ type: "item_added", item, category: cat, size, price, source })
  }

  const handleItemClick = (item, cat) => {
    emitActivity({ type: "item_click", item, category: cat })
    const sizes = Object.entries(item.sizes)
    if (sizes.length === 1) {
      const [size, price] = sizes[0]
      addToCart(item, size, price, cat)
    } else {
      setSizePicker({ item, category: cat })
    }
  }

  // Scanner: an item barcode rings it up like a tap, anything else is a loyalty card.
  // Ignored while paying or on the success screen, when the cart is the finished order.
  const onScanRef = useRef()
  onScanRef.current = (code) => {
    if (showPayment || success) return
    const hit = matchScan(code, MENU)
    if (hit.type === "ignored") return
    if (hit.type === "loyalty") return setLoyaltyId(hit.id)
    if (hit.size) addToCart(hit.item, hit.size, hit.item.sizes[hit.size], hit.category)
    else handleItemClick(hit.item, hit.category)
  }
  useEffect(() => listenForScans((code) => onScanRef.current(code)), [])

  const incrementFromCart = (entry) =>
    setCart((prev) => prev.map((e) => (e.key === entry.key ? { ...e, count: e.count + 1 } : e)))

  // source: "cashier" (a tap), or "voice" when Vavoom Assist takes off what speech added.
  const decrementFromCart = (key, source = "cashier") => {
    const line = cart.find((e) => e.key === key)
    if (line) emitActivity({ type: "item_removed", item: line.item, category: line.category, size: line.size, source })
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.key === key)
      if (idx < 0) return prev
      if (prev[idx].count <= 1) return prev.filter((e) => e.key !== key)
      const next = [...prev]
      const via = { ...(next[idx].via || {}) }
      // A removed unit comes off the assisted counts last-in-first-out: upsell, then voice.
      if (via.upsell) via.upsell -= 1
      else if (via.voice) via.voice -= 1
      next[idx] = { ...next[idx], count: next[idx].count - 1, via }
      return next
    })
  }

  const setQty = (key, qty) =>
    setCart((prev) => prev.map((e) => (e.key === key ? { ...e, count: Math.max(1, Math.min(99, qty)) } : e)))

  // ── Keypad (legacy) ──────────────────────────────────────────────────────
  const pressDigit = (d) => setEntry((e) => (e + d).slice(0, 4))
  const backspace = () => setEntry((e) => e.slice(0, -1))
  const clearEntry = () => setEntry("")
  const applyQty = () => {
    if (selectedKey && entry) { setQty(selectedKey, parseInt(entry, 10) || 1); setEntry("") }
  }
  const applyDiscount = () => {
    const pct = Math.max(0, Math.min(100, parseFloat(entry) || 0))
    setDiscountPct(pct)
    setEntry("")
    emitActivity({ type: "discount", pct })
  }

  // ── Ticket ops ───────────────────────────────────────────────────────────
  const voidLine = () => {
    if (!selectedKey) return
    const line = cart.find((e) => e.key === selectedKey)
    if (line) emitActivity({ type: "item_removed", item: line.item, category: line.category, size: line.size })
    setCart((prev) => prev.filter((e) => e.key !== selectedKey))
    setSelectedKey(null)
  }
  const clearAll = () => {
    setCart([]); setSelectedKey(null); setEntry(""); setDiscountPct(0); setLoyaltyId(null)
    emitActivity({ type: "clear" })
  }
  const hold = () => {
    if (!cart.length) return
    setHolds((h) => [...h, { cart, discountPct, loyaltyId, id: orderId }])
    clearAll()
  }
  const recall = () =>
    setHolds((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setCart(last.cart); setDiscountPct(last.discountPct); setLoyaltyId(last.loyaltyId); setSelectedKey(null)
      return h.slice(0, -1)
    })

  // ── Totals ───────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, e) => s + e.price * e.count, 0)
  const discount = subtotal * (discountPct / 100)
  const taxable = subtotal - discount
  const tax = taxable * TAX_RATE
  const total = taxable + tax
  const itemCount = cart.reduce((s, e) => s + e.count, 0)

  // ── Mirror the live order to follower POS screens (the /screens viewer) ───
  const snapRef = useRef(null)
  snapRef.current = {
    operator: user.name, orderId, itemCount,
    cart: cart.map((e) => ({ name: e.item.name, size: e.size, price: e.price, count: e.count, category: e.category })),
    subtotal, discount, discountPct, tax, total,
  }
  // Broadcast on every order change, and whenever a follower says hello (so a
  // newly-opened mirror syncs immediately).
  useEffect(() => { broadcastOrder(snapRef.current) }, [cart, discountPct])
  useEffect(() => onHello(() => broadcastOrder(snapRef.current)), [])

  // ── Payment / lifecycle ──────────────────────────────────────────────────
  const handleComplete = async (method) => {
    const orderData = {
      orderId, items: cart, subtotal, discount, tax, total, method,
      customerName: "Walk-in", operatorName: user.name, loyaltyId,
    }
    setSuccess(orderData)
    setOrderNum((n) => n + 1)
    _setShowPayment(false)
    emitActivity({ type: "payment_complete", total })
    syncOrderToVavoom(orderData)
    // Show the auto-print outcome on the success screen instead of dropping it.
    if (printerOnline) printReceipt(orderData).then((printResult) =>
      setSuccess((s) => (s && s.orderId === orderData.orderId ? { ...s, printResult } : s)))
  }

  const handlePrintReceipt = async () => {
    if (!success) return
    return printReceipt(success)
  }

  const handleNewOrder = () => { clearAll(); setSuccess(null); emitActivity({ type: "new_order" }) }

  const handleLogout = () => { clearSession(); onLogout() }

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const dateStr = time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })

  return {
    // catalog
    category, setCategory, items, CATEGORIES,
    // cart
    cart, selectedKey, setSelectedKey, cartCountFor,
    addToCart, handleItemClick, incrementFromCart, decrementFromCart, setQty,
    voidLine, clearAll, hold, recall, holds,
    // keypad
    entry, pressDigit, backspace, clearEntry, applyQty, applyDiscount, discountPct, setDiscountPct,
    // totals
    subtotal, discount, tax, total, itemCount,
    // payment / session
    sizePicker, setSizePicker, showPayment, setShowPayment, success,
    handleComplete, handlePrintReceipt, handleNewOrder, handleLogout,
    orderId, printerOnline, user, timeStr, dateStr,
    loyaltyId, setLoyaltyId,
  }
}
