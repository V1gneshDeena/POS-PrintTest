// Vavoom Backend sync — fire-and-forget order push
// Posts completed orders to the Vavoom .NET backend API

const BACKEND_URL = "https://api.vavoom.io"
const LOCATION_ID = "a0a05430-0002-4000-8000-000000000002" // gregs-vavoom (DB persistence)
// (Demo meal-matching is routed by the per-demo DIGITAL printer — see
//  services/printer.js — not from here; this stays the real-location sync.)

// Hosted test copies (Vercel) must never write orders into the live location's data.
export const ORDER_SYNC_OFF = window.location.hostname.endsWith(".vercel.app")

/**
 * Send a completed order to the Vavoom backend.
 * Fire-and-forget — doesn't block the POS.
 */
export async function syncOrderToVavoom(order) {
  if (ORDER_SYNC_OFF) return
  try {
    const payload = {
      locationId: LOCATION_ID,
      orderNumber: String(order.orderId),
      customerName: order.customerName || "Walk-in",
      operatorName: order.operatorName || null,
      loyaltyId: order.loyaltyId || null,
      items: order.items.map((entry) => ({
        name: entry.item ? entry.item.name : entry.name,
        size: entry.size !== "each" && entry.size !== "bottle" ? entry.size : null,
        quantity: entry.count,
        price: entry.price,
        total: entry.price * entry.count,
      })),
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      paymentMethod: order.method,
      source: "gregory_pos",
      timestamp: new Date().toISOString(),
    }

    const res = await fetch(`${BACKEND_URL}/api/app/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      console.log(`[VavoomSync] Order #${order.orderId} synced to backend`)
    } else {
      console.warn(`[VavoomSync] Backend responded ${res.status}`)
    }
  } catch (err) {
    // Fire-and-forget — log but don't break the POS
    console.warn("[VavoomSync] Sync failed:", err.message)
  }
}
