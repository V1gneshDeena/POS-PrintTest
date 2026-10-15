// demoPresence.js — report this POS as live to the demo-console health screen.
// No-op without ?demo= (so the standalone POS is unaffected). Mirror of the
// tablet/TV helpers.

import { getDemoId, configServiceUrl } from "./assist/demoContext.js"

export function startPresence(surface) {
  const ping = () => {
    const demoId = getDemoId()
    if (!demoId) return
    fetch(`${configServiceUrl()}/demos/${demoId}/ping?surface=${encodeURIComponent(surface)}`, { method: "POST" }).catch(() => {})
  }
  ping()
  return setInterval(ping, 5000)
}
