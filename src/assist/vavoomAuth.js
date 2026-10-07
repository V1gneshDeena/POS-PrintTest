// vavoomAuth.js — Vavoom sign-in for Assist's speech-to-text.
//
// The POS's own name bar (AuthScreen) is not a login. Speech-to-text costs GPU time on
// production whisper, so the config service's /stt bridge only accepts a signed pass
// ("ticket") that POST /auth/login hands out after checking an existing Vavoom account
// against api.vavoom.io. The password goes to the config service once and is never
// stored; only the ticket, the display name and the expiry are kept, in sessionStorage,
// so closing the tab signs Assist out.

import { configServiceUrl } from "./demoContext.js"

const KEY = "vavoom-assist-auth"

export function loadAssistAuth() {
  try {
    const a = JSON.parse(sessionStorage.getItem(KEY) || "null")
    if (!a?.ticket || !a?.expiresAt || a.expiresAt < Date.now() + 30_000) return null
    return a
  } catch {
    return null
  }
}

export function clearAssistAuth() {
  try { sessionStorage.removeItem(KEY) } catch { /* private mode */ }
}

/** Sign in with an existing Vavoom account. Resolves { ok, auth?, error? }. */
export async function signInAssist(username, password) {
  try {
    const res = await fetch(`${configServiceUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok || !body.ticket) {
      return { ok: false, error: body.error || `Sign-in failed (${res.status})` }
    }
    const auth = { ticket: body.ticket, name: body.user?.name || username, expiresAt: body.expiresAt }
    try { sessionStorage.setItem(KEY, JSON.stringify(auth)) } catch { /* private mode: memory only */ }
    return { ok: true, auth }
  } catch {
    return { ok: false, error: "Sign-in service unreachable" }
  }
}
