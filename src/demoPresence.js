// demoPresence.js — report this POS as live to the demo-console health screen.
// No-op without ?demo= (so the standalone POS is unaffected). Mirror of the
// tablet/TV helpers.

const ENV = import.meta.env || {}

function configServiceUrl() {
  const host = window.location.hostname
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return `http://${host}:8095`
  return ENV.VITE_CONFIG_SERVICE_URL || "https://demo-api.vavoom.io"
}

function getDemoId() {
  const fromUrl = new URLSearchParams(window.location.search).get("demo")
  if (fromUrl) {
    try { localStorage.setItem("vavoom-demo-id", fromUrl) } catch { /* private mode */ }
    return fromUrl
  }
  try { return localStorage.getItem("vavoom-demo-id") } catch { return null }
}

export function startPresence(surface) {
  const ping = () => {
    const demoId = getDemoId()
    if (!demoId) return
    fetch(`${configServiceUrl()}/demos/${demoId}/ping?surface=${encodeURIComponent(surface)}`, { method: "POST" }).catch(() => {})
  }
  ping()
  return setInterval(ping, 5000)
}
