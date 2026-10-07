// AssistOverlay.jsx — the only parts of Vavoom Assist on the POS screen itself.
//
// Two floating boxes the cashier can drag anywhere (positions are remembered):
//   • the UPSELL SQUARE — the upsell when one pops up, with Add / No thanks, the hot-key
//     tag at the top when what was said decided it (Closest substitute, Counter: too
//     sweet, Alternative, Complimentary, You asked about it) and, under an asked-about
//     item, the complementary item with its own Add; otherwise
//     whether Assist is waiting for a customer or listening. Its header shows three
//     status dots (microphone, speech-to-text, camera) and the "Full bar" link, which
//     opens everything else (inputs, behaviour reading, heard order, offer history,
//     whisper's raw messages, the event log) as its own page (AssistFullBar.jsx).
//     Before Vavoom sign-in it holds the sign-in form instead.
//   • the TRANSCRIPT — the live partial line and the last few lines heard.
// All state comes from useAssist().

import { useEffect, useRef, useState } from "react"
import { C, fmt } from "../components/posTheme.js"
import { useDraggable } from "./useDraggable.js"
import { fullBarUrl } from "./assistSync.js"

const SOURCE_LABEL = {
  ai: "Vavoom AI · from the conversation",
  basket: "Basket completion",
  upsize: "Upsize",
  behaviour: "From what the screen shows",
  hotkey: "Hot key · from what was just said",
}

/** The hot-key tag across the top of the card. */
export function CardTag({ tag }) {
  if (!tag) return null
  const free = tag === "Complimentary"
  return (
    <div style={{ display: "inline-block", fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "3px 8px", borderRadius: 6, marginBottom: 6, background: free ? "#22C55E26" : "#F59E0B26", color: free ? C.success : "#FBBF24" }}>
      {tag}
    </div>
  )
}

const btn = (primary) => ({
  padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12,
  border: primary ? "none" : `1px solid ${C.navyBorder}`, background: primary ? C.lime : "transparent",
  color: primary ? C.limeText : C.textSec,
})
const input = {
  width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.navyBorder}`,
  background: C.navy, color: C.text, fontFamily: "inherit", fontSize: 12, outline: "none",
}
const box = {
  position: "fixed", zIndex: 250, background: `${C.navyMid}F2`, border: `1px solid ${C.navyBorder}`,
  borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.45)", color: C.text, backdropFilter: "blur(6px)",
}

function Dot({ on, bad, title }) {
  return <span title={title} style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: bad ? C.danger : on ? C.success : C.textMuted }} />
}

function SignIn({ onSignIn }) {
  const [u, setU] = useState("")
  const [p, setP] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const submit = async (e) => {
    e.preventDefault()
    if (!u || !p) return
    setBusy(true); setErr("")
    const r = await onSignIn(u, p)
    setBusy(false)
    if (!r.ok) setErr(r.error)
    else setP("")
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.4 }}>Sign in with your Vavoom account to start listening.</div>
      <input style={input} placeholder="Email or username" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
      <input style={input} placeholder="Password" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
      {err ? <div style={{ fontSize: 11, color: C.danger }}>{err}</div> : null}
      <button type="submit" disabled={busy} style={btn(true)}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  )
}

function UpsellSquare({ a }) {
  const { pos, boxRef, handleProps } = useDraggable("upsell", () => ({ x: Math.max(16, window.innerWidth - 640), y: 76 }))
  const s = a.status
  const c = a.card
  const openFullBar = (e) => {
    e.preventDefault()
    window.open(fullBarUrl(), "vavoom-assist-full-bar", "width=1180,height=860")
  }
  const priceText = c ? (c.kind === "upsize"
    ? `+${fmt(c.price - (c.entry.sizes.find(([l]) => l === c.fromSize)?.[1] || 0))}`
    : c.price === 0 ? "Free" : fmt(c.price)) : ""
  return (
    <div ref={boxRef} style={{ ...box, left: pos.x, top: pos.y, width: 300 }}>
      <div {...handleProps} style={{ ...handleProps.style, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${C.navyBorder}`, userSelect: "none" }}>
        <span style={{ background: C.lime, color: C.limeText, fontWeight: 900, fontSize: 9, padding: "2px 6px", borderRadius: 5 }}>VAVOOM</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: a.phase === "active" ? C.lime : C.textSec, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.phase === "active" ? (a.customerName ? `${a.customerName} · at the counter` : "At the counter") : "Standby"}
        </span>
        <Dot on={s.mic === "on"} bad={s.mic === "blocked"} title={`Microphone: ${s.mic}${s.micError ? ` — ${s.micError}` : ""}`} />
        <Dot on={s.stt === "connected"} bad={s.stt === "error"} title={`Speech-to-text: ${s.stt}${s.sttError ? ` — ${s.sttError}` : ""}`} />
        <Dot on={a.presenceOn && a.present} bad={s.presence === "unavailable"} title={`Counter presence: ${a.presenceOn ? s.presence : "camera off"}`} />
        <a href={fullBarUrl()} onClick={openFullBar} style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textDecoration: "none", marginLeft: 2 }} title="Open the full Assist bar: inputs, what the screen says, heard order, and what it's doing behind the scenes">Full bar ↗</a>
      </div>

      <div style={{ padding: 12, minHeight: 120 }}>
        {!a.auth ? <SignIn onSignIn={a.signIn} /> : c ? (
          <>
            <CardTag tag={c.tag} />
            <div style={{ fontSize: 10, fontWeight: 700, color: c.source === "ai" ? "#C084FC" : C.textSec, marginBottom: 4 }}>{SOURCE_LABEL[c.source] || c.source}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{c.title}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.lime }}>{priceText}</div>
            </div>
            <div style={{ fontSize: 11, color: C.textSec, margin: "6px 0 12px", lineHeight: 1.35 }}>{c.reason}</div>
            {c.pair ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "-4px 0 12px", padding: "7px 9px", borderRadius: 8, background: C.navyCard, border: `1px solid ${C.navyBorder}` }}>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>Goes with it</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{c.pair.entry.name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.lime }}>{fmt(c.pair.price)}</span>
                {c.pairAdded
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: C.success }}>✓</span>
                  : <button onClick={() => a.addPair()} style={{ ...btn(false), padding: "3px 8px", fontSize: 11 }}>+ Add</button>}
              </div>
            ) : null}
            {c.state === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => a.accept()} style={{ ...btn(true), flex: 1, padding: "10px 12px", fontSize: 13 }}>Add{c.kind === "upsize" ? " upsize" : ""}</button>
                <button onClick={() => a.decline()} style={btn(false)}>No thanks</button>
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800, color: c.state === "accepted" ? C.success : C.textSec }}>
                {c.state === "accepted" ? "Added to the ticket ✓" : c.state === "declined" ? "Declined" : "No answer — moving on"}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.4 }}>
              {a.phase === "active" ? "Listening — the upsell pops up here." : "Waiting for a customer at the counter."}
            </div>
            {a.phase !== "active" ? <button onClick={a.startCustomer} style={btn(false)}>Start customer</button> : null}
          </div>
        )}
      </div>

      {a.auth ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderTop: `1px solid ${C.navyBorder}`, fontSize: 10, color: C.textMuted }}>
          <span>{a.offers.length ? `${a.offers.length} shown · ${a.offers.filter((o) => o.outcome === "accepted").length} taken` : "No upsells yet"}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button onClick={() => a.setPresenceOn(!a.presenceOn)} style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }}>{a.presenceOn ? "Camera off" : "Camera on"}</button>
            {a.phase === "active" ? <button onClick={a.endCustomer} style={{ ...btn(false), padding: "3px 8px", fontSize: 10 }}>End customer</button> : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function TranscriptBox({ a }) {
  const { pos, boxRef, handleProps } = useDraggable("transcript", () => ({ x: 16, y: Math.max(80, window.innerHeight - 190) }))
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }) }, [a.lines, a.partial])
  const recent = a.lines.slice(-3)
  return (
    <div ref={boxRef} style={{ ...box, left: pos.x, top: pos.y, width: 440 }}>
      <div {...handleProps} style={{ ...handleProps.style, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${C.navyBorder}`, userSelect: "none" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>Transcript</span>
        <div style={{ flex: 1, height: 4, background: C.navy, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(a.level * 100)}%`, height: "100%", background: C.lime, transition: "width 0.1s" }} />
        </div>
      </div>
      <div style={{ padding: "8px 12px", maxHeight: 96, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {recent.length === 0 && !a.partial ? <div style={{ fontSize: 12, color: C.textMuted }}>Waiting for speech…</div> : null}
        {recent.map((l, i) => (
          <div key={`${l.at}-${i}`} style={{ fontSize: 13, lineHeight: 1.35, color: i === recent.length - 1 && !a.partial ? C.text : C.textSec }}>{l.text}</div>
        ))}
        {a.partial ? <div style={{ fontSize: 13, color: C.text, fontStyle: "italic" }}>{a.partial}…</div> : null}
        <div ref={end} />
      </div>
    </div>
  )
}

export default function AssistOverlay({ assist }) {
  return (
    <>
      <UpsellSquare a={assist} />
      <TranscriptBox a={assist} />
    </>
  )
}
