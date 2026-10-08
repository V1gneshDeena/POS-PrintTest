// AssistFullBar.jsx — the full Vavoom Assist bar, as its own page (?demo=<id>&view=assist).
//
// Opened from the "Full bar" link on the POS's upsell square, or from the demo console
// as its own surface for a second screen. It renders the snapshot the POS publishes
// (assistSync.js) and never runs Assist itself: session and inputs, the upsell and the
// history of every card shown, what the screen activity says about the customer, the
// heard order, the live ticket, the transcript, the HOT KEYS that fired (hotkeys.json:
// the words that force the upsell to be re-evaluated) with what each one did, and BEHIND
// THE SCENES — every message whisper and the speech bridge sent, and Assist's own log.
//
// Controls (start / end customer, Add / No thanks, camera, a typed line, clear out-of-stock, forget
// voices) work when this
// page is open in the same browser as the POS; on any other screen it is view only.
//
// "Back to POS" (top left) closes this window and brings the POS forward when the POS
// opened it, and otherwise loads the POS for this room in this tab. It is hidden when the
// page is embedded (the demo console's surface).

import { useEffect, useRef, useState } from "react"
import { C, fmt } from "../components/posTheme.js"
import { startAssistViewer, posUrl } from "./assistSync.js"
import { CardTag } from "./AssistOverlay.jsx"
import { getDemoId } from "./demoContext.js"

const SOURCE_LABEL = { ai: "Vavoom AI · from the conversation", basket: "Basket completion", upsize: "Upsize", behaviour: "From what the screen shows", hotkey: "Hot key · from what was just said", brain: "Vavoom brain · voice, history, calories, Qwen" }
const SOURCE_SHORT = { ai: "AI", basket: "Basket", upsize: "Upsize", behaviour: "Behaviour", hotkey: "Hot key", brain: "Brain" }
const CONSTRAINT_LABEL = { dairy_free: "dairy-free", sugar_aware: "watching sugar", decaf: "no caffeine", health: "health-minded", no_food: "drink only" }
const OUTCOME_COLOR = { accepted: C.success, declined: C.danger, lapsed: C.textMuted }
const time = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const btn = (primary, disabled) => ({
  padding: "7px 12px", borderRadius: 8, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12,
  border: primary ? "none" : `1px solid ${C.navyBorder}`, background: primary ? C.lime : "transparent",
  color: primary ? C.limeText : C.textSec, opacity: disabled ? 0.4 : 1,
})

function Card({ title, right, children, grow }) {
  return (
    <section style={{ background: C.navyMid, border: `1px solid ${C.navyBorder}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", minHeight: 0, flex: grow ? 1 : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>{title}</span>
        {right}
      </div>
      <div style={{ minHeight: 0, overflowY: "auto" }}>{children}</div>
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 0" }}>
      <span style={{ width: 90, color: C.textSec, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

const Muted = ({ children }) => <div style={{ fontSize: 11, color: C.textMuted }}>{children}</div>

export default function AssistFullBar() {
  const [s, setS] = useState(null)
  const [local, setLocal] = useState(false)
  const [say, setSay] = useState("")
  const viewer = useRef(null)

  useEffect(() => {
    document.title = "Vavoom Assist — full bar"
    viewer.current = startAssistViewer((state, { local: isLocal }) => {
      setS(state)
      if (isLocal) setLocal(true)
    })
    return () => viewer.current?.close()
  }, [])

  const cmd = (command) => { if (local) viewer.current?.send(command) }
  const demoId = getDemoId()

  if (!demoId) return <Shell><Muted>Open this page with ?demo=&lt;demo id&gt;&amp;view=assist.</Muted></Shell>
  if (!s) return <Shell demoId={demoId}><Muted>Waiting for the POS in demo room {demoId}… Open the POS with this room and sign in to Vavoom on it.</Muted></Shell>

  const st = s.status || {}
  const c = s.card
  const accepted = (s.offers || []).filter((o) => o.outcome === "accepted").length

  return (
    <Shell demoId={demoId} local={local} brand={s.brand}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
        {/* ── Column 1: session, inputs, controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Session">
            <Row label="State"><b style={{ color: s.phase === "active" ? C.lime : C.textSec }}>{s.phase === "active" ? "Customer at the counter" : "Standby"}</b></Row>
            {s.trigger ? <Row label="Started by">{s.trigger}</Row> : null}
            {s.customerName ? <Row label="Customer">{s.customerName}</Row> : null}
            <Row label="Menu">{s.brand} <span style={{ color: C.textMuted }}>({s.restaurant === "gregorys" ? "Gregory's coffee menu" : "burger menu"})</span></Row>
            <Row label="Vavoom login">{s.signedIn ? s.operator || "signed in" : <span style={{ color: C.danger }}>not signed in on the POS</span>}</Row>
          </Card>
          <Card title="Inputs">
            <Row label="Microphone">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, height: 6, background: C.navy, borderRadius: 3, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${Math.round((s.level || 0) * 100)}%`, height: "100%", background: C.lime }} />
                </span>
                <span style={{ color: st.mic === "blocked" ? C.danger : C.text }}>{st.mic === "blocked" ? "blocked" : st.mic || "off"}</span>
              </span>
            </Row>
            {st.micError ? <Muted>{st.micError}</Muted> : null}
            <Row label="Speech-to-text">
              <span style={{ color: st.stt === "error" ? C.danger : st.stt === "connected" ? C.success : C.text }}>
                {st.stt === "connected" ? "live — POS mic → demo speech bridge → whisper" : st.stt || "off"}{st.sttError ? ` · ${st.sttError}` : ""}
              </span>
            </Row>
            <Row label="Presence">
              {s.presenceOn ? `${st.presence === "watching" ? (s.present ? "customer at the counter" : "watching the counter") : st.presence || ""}${st.presenceError ? ` · ${st.presenceError}` : ""}` : "camera off"}
            </Row>
            {s.presenceOn ? <Muted>Closest face {Math.round((st.faceFrac || 0) * 100)}% of the frame width (counts from 12%). Arrive after 1.5 s at 70%; leave after 6 s with no face. On-device detector.</Muted> : null}
          </Card>
          <Card title="Controls" right={!local ? <span style={{ fontSize: 10, color: C.textMuted }}>view only on this screen</span> : null}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button disabled={!local} onClick={() => cmd({ type: s.phase === "active" ? "end" : "start" })} style={btn(true, !local)}>{s.phase === "active" ? "End customer" : "Start customer"}</button>
              <button disabled={!local} onClick={() => cmd({ type: "camera", on: !s.presenceOn })} style={btn(false, !local)}>{s.presenceOn ? "Camera off" : "Camera on"}</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); cmd({ type: "say", text: say }); setSay("") }} style={{ display: "flex", gap: 6 }}>
              <input disabled={!local} value={say} onChange={(e) => setSay(e.target.value)} placeholder="Type what the customer says…"
                style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.navyBorder}`, background: C.navy, color: C.text, fontFamily: "inherit", fontSize: 12 }} />
              <button disabled={!local} type="submit" style={btn(false, !local)}>Say</button>
            </form>
            {!local ? <Muted>Controls work when this page is opened from the POS's “Full bar” link on the same device.</Muted> : null}
          </Card>
        </div>

        {/* ── Column 2: upsell, behaviour, heard order ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Upsell" right={<span style={{ fontSize: 10, color: C.textSec }}>{(s.offers || []).length} shown · {accepted} taken</span>}>
            {c ? (
              <div style={{ background: c.state === "pending" ? `${C.lime}12` : C.navyCard, border: `1px solid ${c.state === "pending" ? C.lime + "66" : C.navyBorder}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <CardTag tag={c.tag} />
                <div style={{ fontSize: 10, fontWeight: 700, color: c.source === "ai" ? "#C084FC" : C.textSec }}>{SOURCE_LABEL[c.source] || c.source}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "3px 0" }}>
                  <b style={{ fontSize: 15 }}>{c.title}</b>
                  <b style={{ color: C.lime }}>{c.kind === "upsize" ? `+${fmt(c.price - c.fromPrice)}` : c.price === 0 ? "Free" : fmt(c.price)}</b>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>{c.reason}</div>
                {c.pair ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 8 }}>
                    <span style={{ color: C.textMuted, fontSize: 10 }}>Goes with it</span>
                    <b style={{ flex: 1 }}>{c.pair.title}</b><span style={{ color: C.lime }}>{fmt(c.pair.price)}</span>
                    {c.pair.added ? <span style={{ color: C.success, fontWeight: 800 }}>✓</span>
                      : <button disabled={!local} onClick={() => cmd({ type: "pair" })} style={{ ...btn(false, !local), padding: "2px 8px", fontSize: 11 }}>+ Add</button>}
                  </div>
                ) : null}
                {c.state === "pending" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={!local} onClick={() => cmd({ type: "accept" })} style={btn(true, !local)}>Add</button>
                    <button disabled={!local} onClick={() => cmd({ type: "decline" })} style={btn(false, !local)}>No thanks</button>
                  </div>
                ) : <div style={{ fontSize: 12, fontWeight: 800, color: OUTCOME_COLOR[c.state] || C.textSec }}>{c.state}{c.via ? ` · ${c.via}` : ""}</div>}
              </div>
            ) : <Muted>No card on screen.</Muted>}
            {(s.offers || []).length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[...s.offers].reverse().map((o) => (
                  <div key={o.key + o.at} style={{ display: "flex", gap: 8, fontSize: 11.5, alignItems: "baseline" }}>
                    <span style={{ color: C.textMuted, width: 62 }}>{time(o.at)}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: C.textSec, width: 58 }}>{SOURCE_SHORT[o.source] || o.source}</span>
                    <span style={{ flex: 1 }}>{o.title}</span>
                    <span style={{ fontWeight: 700, color: OUTCOME_COLOR[o.outcome] || C.lime }}>{o.outcome || "on screen"}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {s.aiNote && !s.aiNote.grounded ? <Muted>Vavoom AI's last pick “{s.aiNote.item}” is not on this POS menu, so it was skipped.</Muted> : null}
          </Card>
          <Card title="Reading the screen">
            {(s.behaviours || []).length ? s.behaviours.map((b) => (
              <div key={b.key + (b.category || "")} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><b>{b.label}</b><span style={{ color: C.textSec }}>{Math.round(b.confidence * 100)}%</span></div>
                <div style={{ height: 3, background: C.navy, borderRadius: 2, margin: "3px 0" }}><div style={{ width: `${b.confidence * 100}%`, height: "100%", background: "#60A5FA", borderRadius: 2 }} /></div>
                <div style={{ fontSize: 11, color: C.textSec }}>{b.meaning} → <span style={{ color: C.text }}>{b.action}</span></div>
              </div>
            )) : <Muted>Nothing yet — the POS hasn't been browsed this order.</Muted>}
          </Card>
          <Card title="Heard order">
            {(s.heard || []).length ? s.heard.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", color: h.qty ? C.text : C.textMuted }}>
                <span>{h.qty}× {h.size && h.size !== "each" ? `${h.size} ` : ""}{h.name} <span style={{ fontSize: 10, color: C.textMuted }}>({h.sources.join(" + ")})</span></span>
                <span style={{ fontSize: 10, color: h.locked ? C.textMuted : h.added ? C.success : C.textSec }}>
                  {h.qty === 0 ? "cancelled" : h.locked ? "cashier changed it" : h.added ? "on ticket ✓" : "already rung"}
                </span>
              </div>
            )) : <Muted>Items the customer names are rung up automatically and listed here.</Muted>}
          </Card>
          <Card title="Ticket on the POS">
            {(s.ticket || []).length ? s.ticket.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                <span>{t.count}× {t.size !== "each" ? `${t.size} ` : ""}{t.name}
                  {t.via?.voice ? <span style={{ color: "#60A5FA", fontSize: 10 }}> 🎙 heard</span> : null}
                  {t.via?.upsell ? <span style={{ color: C.lime, fontSize: 10 }}> ★ upsell</span> : null}
                </span>
                <span>{fmt(t.price * t.count)}</span>
              </div>
            )) : <Muted>Empty.</Muted>}
          </Card>
        </div>

        {/* ── Column 3: hot keys, transcript, behind the scenes ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Voice print" right={s.voice?.voice_id ? <span style={{ fontSize: 10, fontWeight: 700, color: s.voice.matched ? C.success : C.textSec }}>{s.voice.matched ? "returning" : "new"}</span> : null}>
            {s.voice?.voice_id ? (
              <>
                <Row label="Voice">{s.voice.voice_id} <span style={{ color: C.textMuted }}>(anonymous; no name is stored)</span></Row>
                <Row label="Match">{s.voice.matched ? `score ${s.voice.score} · tier ${s.voice.tier}` : `no match at 0.5 or above${s.voice.score != null ? ` (best ${s.voice.score})` : ""} — a new voice print`}</Row>
                <Row label="Visits">{s.voice.matched ? `${s.voice.visits} before this one` : "first visit"}</Row>
                {(s.voice.last_order || []).length ? <Row label="Last time">{s.voice.last_order.map((x) => `${x.qty > 1 ? `${x.qty}× ` : ""}${x.name}${x.size && x.size !== "each" ? ` (${x.size})` : ""}`).join(", ")}</Row> : null}
                <Row label="From">{s.voice.seconds} s of the customer's speech · ECAPA {s.voice.embed_ms} ms on the GPU · {s.voice.round_trip_ms} ms round trip</Row>
              </>
            ) : <Muted>Waiting for about 2.5 s of the customer's speech. Lines are marked as the customer's or the employee's; only the customer's speech makes the voice print (ECAPA on the GPU box). Matches are searched in tiers from 1.0 down to 0.5; below 0.5 the voice is new.</Muted>}
            <div style={{ marginTop: 8 }}>
              <button disabled={!local} onClick={() => cmd({ type: "forget_voices" })} style={{ ...btn(false, !local), padding: "2px 8px", fontSize: 10 }}
                title="Delete this demo room's voice prints and the receipts tagged by them">Forget voices in this room</button>
            </div>
          </Card>
          <Card title="Upsell brain" right={s.brain ? <span style={{ fontSize: 10, color: C.textSec }}>{s.brain.latency_ms} ms brain · {s.brain.round_trip_ms} ms round trip · {s.brain.framer}</span> : null}>
            {s.brain?.error ? <Muted>Unavailable: {s.brain.error}</Muted> : s.brain ? (
              <>
                <Row label="Pick">{s.brain.item || "(nothing to offer)"} {s.brain.tag ? <CardTag tag={s.brain.tag} /> : null}</Row>
                {s.brain.framing ? <Row label="Line">“{s.brain.framing}”</Row> : null}
                <Row label="Ladder step">{s.brain.trace?.step || s.brain.step || "—"}</Row>
                <Row label="Meal">{s.brain.trace?.calories?.kcal ?? "—"} cal ({s.brain.trace?.calories?.band || "—"}) · health {s.brain.trace?.health ?? "—"}{(s.brain.trace?.allergens || []).length ? ` · allergy: ${s.brain.trace.allergens.join(", ")}` : ""}</Row>
                {s.brain.trace?.visits ? <Row label="History">{s.brain.trace.visits} visit(s){s.brain.trace.gap != null ? ` · ${fmt(s.brain.trace.gap)} below their usual spend` : ""}</Row> : null}
                {(s.brain.trace?.ranked || []).length ? (
                  <div style={{ marginTop: 6 }}>
                    {s.brain.trace.ranked.map((r, i) => (
                      <div key={i} style={{ fontSize: 11, color: i ? C.textSec : C.text, display: "flex", gap: 8 }}>
                        <span style={{ width: 150, flexShrink: 0 }}>{r.title}</span>
                        <span>{r.score.toFixed(3)}</span>
                        <span style={{ color: C.textMuted }}>history {r.history} · w·c {(r.w * r.c).toFixed(2)} · fit {r.fit} · best {r.best} · price {r.price_fit}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : <Muted>Asked after every line and ticket change. It runs on the GPU box (glm-upsell, tenant demopos): the ladder, the voice's history, the order's calories and allergies, then Qwen3-14B picks one of the top three and words it.</Muted>}
          </Card>
          <Card title="Hot keys" right={s.hot?.pausedUntil > Date.now() ? <span style={{ fontSize: 10, fontWeight: 700, color: C.danger }}>upsell paused after a complaint</span> : null}>
            {(s.hot?.constraints || []).length || (s.hot?.outToday || []).length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, alignItems: "center" }}>
                {(s.hot.constraints || []).map((c) => <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#3B82F622", color: "#60A5FA" }}>{CONSTRAINT_LABEL[c] || c}</span>)}
                {(s.hot.outToday || []).map((b) => <span key={b} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#3a1620", color: C.danger }}>out today: {b}</span>)}
                {(s.hot.outToday || []).length ? <button disabled={!local} onClick={() => cmd({ type: "clear_out" })} style={{ ...btn(false, !local), padding: "2px 8px", fontSize: 10 }} title="The items are back, or a new demo is starting">Clear out-of-stock</button> : null}
              </div>
            ) : null}
            {(s.hot?.fired || []).length ? s.hot.fired.map((h, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}>
                  <span style={{ color: C.textMuted, fontSize: 10.5, flexShrink: 0 }}>{time(h.at)}</span>
                  <b>{h.label}</b>
                  <span style={{ color: C.textSec }}>“{h.phrase}”{h.items?.length ? ` · ${h.items.join(", ")}` : ""}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginLeft: 62 }}>→ {h.action}</div>
              </div>
            )) : <Muted>None yet. A line that says an item is out, complains, states a dietary need, wants food, orders for others, mentions the weather or the season, or closes the order fires one, and the upsell is re-picked at once.</Muted>}
          </Card>
          <Card title="Transcript">
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {(s.lines || []).map((l, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {l.typed ? <span style={{ color: C.textMuted }}>⌨ </span> : null}{l.text}
                  {l.kind === "order" ? <span style={{ fontSize: 9, fontWeight: 700, color: C.lime, marginLeft: 6 }}>order</span> : l.kind === "offer" ? <span style={{ fontSize: 9, fontWeight: 700, color: "#60A5FA", marginLeft: 6 }}>cashier offer</span> : null}
                </div>
              ))}
              {s.partial ? <div style={{ fontSize: 12, color: C.textSec, fontStyle: "italic" }}>{s.partial}…</div> : null}
              {!(s.lines || []).length && !s.partial ? <Muted>Waiting for speech…</Muted> : null}
            </div>
          </Card>
          <Card title="Behind the scenes — whisper & speech bridge">
            <div style={{ maxHeight: 300, overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {(s.backend || []).length ? s.backend.map((m, i) => (
                <div key={i} style={{ fontSize: 10.5, lineHeight: 1.45, display: "flex", gap: 8 }}>
                  <span style={{ color: C.textMuted, flexShrink: 0 }}>{time(m.at)}</span>
                  <span style={{ color: m.type === "ai_prompt" ? "#C084FC" : m.type === "order_update" ? C.lime : m.type === "bridge_status" ? "#60A5FA" : C.textSec, flexShrink: 0, width: 104 }}>{m.type}</span>
                  <span style={{ color: C.text, wordBreak: "break-word" }}>{m.summary}</span>
                </div>
              )) : <Muted>No messages yet.</Muted>}
            </div>
          </Card>
          <Card title="Assist event log">
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {(s.events || []).length ? s.events.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: C.textSec, lineHeight: 1.45 }}><span style={{ color: C.textMuted }}>{time(e.at)}</span> {e.text}</div>
              )) : <Muted>Nothing yet.</Muted>}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

const EMBEDDED = (() => { try { return window.self !== window.top } catch { return true } })()

function backToPos() {
  // Opened from the POS's "Full bar" link: a window of its own. Bring the POS forward and close it.
  try {
    if (window.opener && !window.opener.closed) { window.opener.focus(); window.close() }
  } catch { /* cross-origin opener: fall through */ }
  setTimeout(() => { if (!window.closed) window.location.href = posUrl() }, 150)
}

function Shell({ children, demoId, local, brand }) {
  return (
    <div style={{ minHeight: "100vh", background: C.navy, color: C.text, padding: 16, boxSizing: "border-box", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {!EMBEDDED ? <button type="button" onClick={backToPos} style={btn(false)} title="Back to the POS">← Back to POS</button> : null}
        <span style={{ background: C.lime, color: C.limeText, fontWeight: 900, fontSize: 12, padding: "4px 9px", borderRadius: 7 }}>VAVOOM</span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Assist — full bar</span>
        {brand ? <span style={{ fontSize: 12, color: C.textSec }}>{brand} · In-Store</span> : null}
        <span style={{ flex: 1 }} />
        {demoId ? <span style={{ fontSize: 11, color: C.textSec }}>room <code>{demoId}</code></span> : null}
        {local !== undefined ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: local ? C.success : C.textSec }}>{local ? "● linked to the POS on this device" : "● watching from another screen"}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
