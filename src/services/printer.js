// ESC/POS receipt printer service
// Sends receipts to an Ethernet thermal printer via a local print proxy

// The browser can't open raw TCP sockets, so we use a lightweight
// print-proxy server running on the same machine (see print-proxy.js)
import { BRAND } from "../data/catalog.js"

const PRINT_PROXY_URL = "http://localhost:9101/print"

// ── Demo digital printer ─────────────────────────────────────────────────────
// In a demo room (?demo=) there's no local print-proxy/printer. The POS instead
// "prints" to a per-demo DIGITAL printer = the demo config service, which is that
// demo's interceptor: it forwards the order to the demo's room so the TV shows it
// at the pickup window. Each demo is its own isolated printer + interceptor.
function getDemoId() {
  try {
    const u = new URLSearchParams(window.location.search).get("demo")
    if (u) { localStorage.setItem("vavoom-demo-id", u); return u }
    return localStorage.getItem("vavoom-demo-id")
  } catch { return null }
}
function configServiceUrl() {
  const host = window.location.hostname
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return `http://${host}:8095`
  return "https://demo-api.vavoom.io"
}
async function printToDigitalPrinter(demoId, order) {
  const payload = {
    orderNumber: String(order.orderId),
    customerName: order.customerName || "Walk-in",
    operatorName: order.operatorName || null,
    items: (order.items || []).map((e) => ({
      name: e.item ? e.item.name : e.name,
      quantity: e.count || e.quantity || 1,
      price: e.price || 0,
    })),
    total: order.total,
  }
  const res = await fetch(`${configServiceUrl()}/demos/${demoId}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: payload }),
  })
  return res.ok
}

// ESC/POS command bytes (assembled as text for the proxy)
const ESC = "\x1B"
const GS = "\x1D"
const LF = "\x0A"

// Commands
const INIT = ESC + "@"               // Initialize printer
const BOLD_ON = ESC + "E\x01"        // Bold on
const BOLD_OFF = ESC + "E\x00"       // Bold off
const CENTER = ESC + "a\x01"         // Center align
const LEFT = ESC + "a\x00"           // Left align
const RIGHT = ESC + "a\x02"          // Right align
const DOUBLE_HEIGHT = ESC + "!\x10"  // Double height
const NORMAL = ESC + "!\x00"         // Normal size
const CUT = GS + "V\x41\x03"        // Partial cut with feed
const FEED_3 = ESC + "d\x03"        // Feed 3 lines

/**
 * Format and print a receipt for a completed order.
 * @param {Object} order - The order data
 * @param {string} order.orderId - Order number
 * @param {Array} order.items - Cart items [{name, size, price, count}]
 * @param {number} order.subtotal
 * @param {number} order.tax
 * @param {number} order.total
 * @param {string} order.method - Payment method
 */
export async function printReceipt(order) {
  // Demo room → print to the per-demo digital printer (the demo's interceptor).
  const demoId = getDemoId()
  if (demoId) {
    try {
      const ok = await printToDigitalPrinter(demoId, order)
      console.log(`[Printer] Order #${order.orderId} → digital printer (demo ${demoId}): ${ok ? "ok" : "failed"}`)
      return { success: ok, digital: true, error: ok ? undefined : "digital printer unreachable" }
    } catch (err) {
      console.warn("[Printer] Digital printer failed:", err.message)
      return { success: false, error: err.message }
    }
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  })
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit"
  })

  const fmt = (n) => `$${n.toFixed(2)}`
  const pad = (left, right, width = 40) => {
    const space = width - left.length - right.length
    return left + " ".repeat(Math.max(1, space)) + right
  }

  let receipt = INIT

  // Header
  receipt += CENTER
  receipt += DOUBLE_HEIGHT + BOLD_ON
  receipt += BRAND.receiptHeader + LF
  receipt += NORMAL + BOLD_OFF
  receipt += BRAND.receiptSub + LF
  receipt += "Powered by VAVOOM" + LF
  receipt += "--------------------------------" + LF
  receipt += LEFT

  // Order info
  receipt += BOLD_ON
  receipt += `Order #${order.orderId}` + LF
  receipt += BOLD_OFF
  receipt += `${dateStr}  ${timeStr}` + LF
  if (order.operatorName) {
    receipt += `Operator: ${order.operatorName}` + LF
  }
  receipt += "--------------------------------" + LF

  // Items
  for (const entry of order.items) {
    const itemName = entry.item ? entry.item.name : entry.name
    const sizeSuffix = entry.size !== "each" && entry.size !== "bottle"
      ? ` (${entry.size})`
      : ""
    const name = `${entry.count}x ${itemName}${sizeSuffix}`
    const price = fmt(entry.price * entry.count)
    receipt += pad(name, price) + LF
  }

  receipt += "--------------------------------" + LF

  // Totals
  receipt += pad("Subtotal", fmt(order.subtotal)) + LF
  receipt += pad("Tax (13%)", fmt(order.tax)) + LF
  receipt += BOLD_ON + DOUBLE_HEIGHT
  receipt += pad("TOTAL", fmt(order.total)) + LF
  receipt += NORMAL + BOLD_OFF
  receipt += "--------------------------------" + LF

  // Payment
  const methodLabel = {
    card: "Credit / Debit Card",
    cash: "Cash",
    apple: "Apple Pay",
    tap: "Tap to Pay",
  }[order.method] || order.method

  receipt += pad("Paid via", methodLabel) + LF
  receipt += LF

  // Footer
  receipt += CENTER
  receipt += "Thank you!" + LF
  receipt += BRAND.thankYou + LF
  receipt += FEED_3
  receipt += CUT

  // Send to print proxy
  // Includes both ESC/POS receipt data AND structured order for backend notification
  try {
    const res = await fetch(PRINT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: receipt, order }),
    })

    if (res.ok) {
      console.log(`[Printer] Receipt for order #${order.orderId} sent`)
      return { success: true }
    } else {
      const errText = await res.text()
      console.warn(`[Printer] Print failed: ${res.status} - ${errText}`)
      return { success: false, error: errText }
    }
  } catch (err) {
    console.warn("[Printer] Connection failed:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Check if the print proxy is reachable.
 */
export async function checkPrinterStatus() {
  // Demo room → the per-demo digital printer is always available.
  if (getDemoId()) return { online: true, digital: true }
  try {
    const res = await fetch("http://localhost:9101/status", { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const data = await res.json()
      return { online: true, printerIp: data.printerIp }
    }
  } catch {
    // proxy not running
  }
  return { online: false }
}
