// demoContext.js — which demo room this POS is in, and whether Vavoom Assist runs.
//
// Vavoom Assist (the in-store demo integration: microphone speech-to-text, counter
// presence, upsells on the POS screen, heard orders added to the ticket) only ever
// runs inside a demo room, i.e. with ?demo=<demoId> in the URL. It switches on when
// that room's config says productType "instore" (rooms the console creates as
// In-Store demos), or when the URL forces it with ?assist=1. ?assist=0 forces it off.
// Without ?demo= nothing here does anything, so the standalone POS is unchanged.

const ENV = import.meta.env || {}

export function getDemoId() {
  try { return new URLSearchParams(window.location.search).get("demo") || "" } catch { return "" }
}

function isLocalHost() {
  const h = window.location.hostname
  return h === "localhost" || h === "127.0.0.1" || h === "::1"
}

/** The demo config service (demo-api.vavoom.io; :8095 when the POS runs locally). */
export function configServiceUrl() {
  if (isLocalHost()) return `http://${window.location.hostname}:8095`
  return ENV.VITE_CONFIG_SERVICE_URL || "https://demo-api.vavoom.io"
}

/** The speech bridge's WebSocket base (sttBridge.js in the config service). */
export function sttBridgeUrl() {
  return configServiceUrl().replace(/^http/, "ws") + "/stt"
}

let configPromise = null
/** The demo room's config blob (cached), or null without ?demo= or on any failure. */
export function fetchDemoConfig() {
  if (configPromise) return configPromise
  const demoId = getDemoId()
  if (!demoId) { configPromise = Promise.resolve(null); return configPromise }
  configPromise = fetch(`${configServiceUrl()}/demos/${encodeURIComponent(demoId)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return configPromise
}

/** Resolves true when Vavoom Assist should run in this POS (see the header). */
export async function resolveAssistEnabled() {
  if (!getDemoId()) return false
  const flag = new URLSearchParams(window.location.search).get("assist")
  if (flag === "0") return false
  if (flag === "1") return true
  const cfg = await fetchDemoConfig()
  return cfg?.productType === "instore"
}
