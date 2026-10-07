// Print Proxy Server — bridges HTTP requests from the browser to the Ethernet printer
// Run: node print-proxy.js
//
// The browser can't open raw TCP sockets, so this lightweight server
// accepts POST /print with receipt data and forwards it to the printer via TCP.
//
// ── Routing ──
//   POS → PrintProxy (HTTP :9101) → Interceptor/Printer (TCP :9100)
//
//   The interceptor (PrinterTester) captures ESC/POS receipt data, parses it,
//   and sends the structured order to the Vavoom backend via SignalR.
//
//   As a belt-and-suspenders backup, this proxy ALSO posts structured order
//   data directly to the Vavoom backend REST API (if an `order` field is
//   included in the POST body).
//

import { createServer } from "http"
import { Socket } from "net"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

// --- Configuration (reads from printer-config.json next to the exe) ---
const __dir = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dir, "printer-config.json")

// Default config — created on first run if missing
const DEFAULT_CONFIG = {
  printerIp: "127.0.0.1",
  printerPort: 9100,
  proxyPort: 9101,
  backendUrl: "https://api.vavoom.io",
  locationId: "a0a05430-0002-4000-8000-000000000002",
  _comment: "print-proxy → interceptor (127.0.0.1:9100) → real printer (192.168.179.107:9100)"
}

let config = { ...DEFAULT_CONFIG }
try {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, "utf-8")
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    console.log(`[Config] Loaded from ${CONFIG_PATH}`)
  } else {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
    console.log(`[Config] Created default config at ${CONFIG_PATH}`)
  }
} catch (err) {
  console.error(`[Config] Error reading config: ${err.message}, using defaults`)
}

const PRINTER_IP = process.env.PRINTER_IP || config.printerIp
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || String(config.printerPort))
const PROXY_PORT = parseInt(process.env.PROXY_PORT || String(config.proxyPort))
const BACKEND_URL = process.env.BACKEND_URL || config.backendUrl || ""
const LOCATION_ID = process.env.LOCATION_ID || config.locationId || ""

console.log(`[Config] Printing to ${PRINTER_IP}:${PRINTER_PORT}`)
if (BACKEND_URL) console.log(`[Config] Backend: ${BACKEND_URL}`)

function sendToPrinter(data) {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    socket.setTimeout(5000)

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      socket.write(data, "binary", () => {
        socket.end()
        resolve()
      })
    })

    socket.on("error", (err) => reject(err))
    socket.on("timeout", () => {
      socket.destroy()
      reject(new Error("Printer connection timed out"))
    })
  })
}

/**
 * Notify the Vavoom backend about a completed order.
 * Fire-and-forget — never blocks printing.
 */
async function notifyBackend(order) {
  if (!BACKEND_URL || !order) return

  try {
    const payload = {
      locationId: LOCATION_ID,
      orderNumber: String(order.orderId || order.orderNumber || ""),
      customerName: order.customerName || "Walk-in",
      operatorName: order.operatorName || null,
      items: (order.items || []).map((entry) => ({
        name: entry.item ? entry.item.name : (entry.name || ""),
        size: entry.size && entry.size !== "each" && entry.size !== "bottle" ? entry.size : null,
        quantity: entry.count || entry.quantity || 1,
        price: entry.price || 0,
        total: (entry.price || 0) * (entry.count || entry.quantity || 1),
      })),
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      total: order.total || 0,
      paymentMethod: order.method || order.paymentMethod || "",
      source: "gregory_print_proxy",
      timestamp: new Date().toISOString(),
    }

    const res = await fetch(`${BACKEND_URL}/api/app/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    console.log(`[PrintProxy] Backend notified: ${res.status} (order #${payload.orderNumber})`)
  } catch (err) {
    // Fire-and-forget — never break the print path
    console.warn(`[PrintProxy] Backend notify failed: ${err.message}`)
  }
}

const server = createServer(async (req, res) => {
  // CORS headers for browser requests
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  // Health/status check
  if (req.method === "GET" && req.url === "/status") {
    // Quick TCP check to see if printer/interceptor is reachable
    const socket = new Socket()
    socket.setTimeout(2000)

    const check = new Promise((resolve) => {
      socket.connect(PRINTER_PORT, PRINTER_IP, () => {
        socket.end()
        resolve(true)
      })
      socket.on("error", () => resolve(false))
      socket.on("timeout", () => { socket.destroy(); resolve(false) })
    })

    const online = await check
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      printerIp: PRINTER_IP,
      printerPort: PRINTER_PORT,
      online,
      routing: `print-proxy → ${PRINTER_IP}:${PRINTER_PORT} (interceptor/printer)`,
    }))
    return
  }

  // Print endpoint
  if (req.method === "POST" && req.url === "/print") {
    let body = ""
    req.on("data", (chunk) => { body += chunk })
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body)
        const { data, order } = parsed

        if (!data) {
          res.writeHead(400, { "Content-Type": "text/plain" })
          res.end("Missing 'data' field")
          return
        }

        // 1. Forward ESC/POS data to interceptor/printer
        await sendToPrinter(data)
        console.log(`[PrintProxy] Receipt sent to ${PRINTER_IP}:${PRINTER_PORT}`)

        // 2. Also notify backend with structured order data (fire-and-forget)
        notifyBackend(order)

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        console.error(`[PrintProxy] Error: ${err.message}`)
        res.writeHead(502, { "Content-Type": "text/plain" })
        res.end(`Printer error: ${err.message}`)
      }
    })
    return
  }

  res.writeHead(404)
  res.end("Not found")
})

server.listen(PROXY_PORT, () => {
  console.log(`[PrintProxy] Listening on http://localhost:${PROXY_PORT}`)
  console.log(`[PrintProxy] Target: ${PRINTER_IP}:${PRINTER_PORT}`)
  console.log(`[PrintProxy] POST /print — send receipt data (+ optional 'order' for backend)`)
  console.log(`[PrintProxy] GET  /status — check printer connectivity`)
})

