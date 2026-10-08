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
//     Before Vavoom sign-in it holds the sign-in form instead. Above the card, an item the
//     customer ordered without a size ("a cheeseburger") asks the cashier to ask for the size,
//     with a button per size that puts it on the ticket (so does the size said, or a tap on the
//     menu). In the "Until accepted or declined" setting, a card the cashier has not said yet
//     carries "Please voice the upsell". Under the card: "Earlier", the upsells a hot word or a
//     better pick replaced (they come back once this one is answered; useAssist.js context
//     window), and "Best in <section>", the best item for this customer in the menu section the
//     cashier has open. The footer's card setting (When the card changes) is a POS-styled menu. An
//     allergy with no substitute (the brain's "notice") is shown as such, with one "Got it" button.
//   • the TRANSCRIPT — the live partial line and the last few lines heard.
// All state comes from useAssist().

import { useEffect, useRef, useState } from "react"
import { C, fmt } from "../components/posTheme.js"
import { useDraggable } from "./useDraggable.js"
import { fullBarUrl } from "./assistSync.js"
import { VavoomMark } from "../components/ui.jsx"
import { CARD_MODES } from "./useAssist.js"

const SOURCE_LABEL = {
  ai: "Vavoom AI · from the conversation",
  basket: "Basket completion",
  upsize: "Upsize",
  behaviour: "From what the screen shows",
  hotkey: "Hot key · from what was just said",
  brain: "Vavoom brain · voice, history, calories, Qwen",
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
// The footer's small pills, in the POS's ghost-button style (ui.jsx GhostButton, smaller).
const pill = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999,
  border: `1px solid ${C.line2}`, background: "transparent", color: C.muted, fontFamily: "inherit",
  fontSize: 11, fontWeight: 500, letterSpacing: "-0.01em", cursor: "pointer", whiteSpace: "nowrap",
  transition: "border-color 0.15s, color 0.15s",
}
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
  // An upsize or a swap (cheese / bacon, an allergy swap) shows the extra cost over the line it replaces.
  const fromPrice = c && (c.kind === "upsize" ? c.entry : c.kind === "swap" ? c.fromEntry : null)
  const basePrice = fromPrice ? (fromPrice.sizes.find(([l]) => l === c.fromSize) || fromPrice.sizes[0])?.[1] || 0 : 0
  const priceText = c ? (c.kind === "notice" ? "" : c.kind === "upsize" || c.kind === "swap"
    ? `+${fmt(Math.max(0, c.price - basePrice))}`
    : c.price === 0 ? "Free" : fmt(c.price)) : ""
  const v = a.voice
  return (
    <div ref={boxRef} style={{ ...box, left: pos.x, top: pos.y, width: 300 }}>
      <div {...handleProps} style={{ ...handleProps.style, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${C.navyBorder}`, userSelect: "none" }}>
        <VavoomMark size={18} />
        <span style={{ fontSize: 11, fontWeight: 700, color: a.phase === "active" ? C.lime : C.textSec, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.phase === "active" ? (a.customerName ? `${a.customerName} · at the counter` : "At the counter") : "Standby"}
        </span>
        <Dot on={s.mic === "on"} bad={s.mic === "blocked"} title={`Microphone: ${s.mic}${s.micError ? ` — ${s.micError}` : ""}`} />
        <Dot on={s.stt === "connected"} bad={s.stt === "error"} title={`Speech-to-text: ${s.stt}${s.sttError ? ` — ${s.sttError}` : ""}`} />
        <Dot on={a.presenceOn && a.present} bad={s.presence === "unavailable"} title={`Counter presence: ${a.presenceOn ? s.presence : "camera off"}`} />
        <a href={fullBarUrl()} onClick={openFullBar} style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textDecoration: "none", marginLeft: 2 }} title="Open the full Assist bar: inputs, what the screen says, heard order, and what it's doing behind the scenes">Full bar ↗</a>
      </div>

      {a.auth && a.phase === "active" && v?.voice_id ? (
        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.navyBorder}`, fontSize: 10.5, color: v.matched ? C.lime : C.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          title={v.matched ? `Voice print ${v.voice_id}: score ${v.score}, tier ${v.tier}` : `New voice print ${v.voice_id}`}>
          {v.matched
            ? `Returning voice · heard ${v.seen || (v.visits || 0) + 1}× before${(v.last_order || []).length ? ` · last time: ${v.last_order.map((x) => x.name).join(", ")}` : ""}`
            : "New voice — no history yet"}
        </div>
      ) : null}
      {a.auth && a.phase === "active" ? <SizePrompt heard={a.heard} onChoose={a.chooseSize} /> : null}
      <div style={{ padding: 12, minHeight: 120 }}>
        {a.auth && c && c.state === "pending" && a.cardMode === "hold" && !c.pitched ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#FBBF24", marginBottom: 8 }}>Please voice the upsell</div>
        ) : null}
        {!a.auth ? <SignIn onSignIn={a.signIn} /> : c ? (
          <>
            <CardTag tag={c.tag} />
            <div style={{ fontSize: 10, fontWeight: 700, color: c.source === "ai" || c.source === "brain" ? "#C084FC" : C.textSec, marginBottom: 4 }}>{SOURCE_LABEL[c.source] || c.source}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{c.title}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.lime }}>{priceText}</div>
            </div>
            <div style={{ fontSize: 11, color: C.textSec, margin: "6px 0 12px", lineHeight: 1.35 }}>{c.back ? "Back to the upsell from before. " : ""}{c.reason}</div>
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
            {c.state === "pending" && (c.memory || []).length ? (
              <div style={{ margin: "-4px 0 12px", fontSize: 10.5, color: C.soft, lineHeight: 1.4 }}>
                Earlier: <span style={{ color: C.text }}>{c.memory.slice().reverse().join(", ")}</span> · comes back after this one
              </div>
            ) : null}
            {c.state === "pending" && c.kind === "notice" ? (
              <button onClick={() => a.decline("tapped Got it")} style={{ ...btn(false), width: "100%", padding: "10px 12px", fontSize: 13 }}>Got it</button>
            ) : c.state === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => a.accept()} style={{ ...btn(true), flex: 1, padding: "10px 12px", fontSize: 13 }}>{c.kind === "upsize" ? "Add upsize" : c.kind === "swap" ? "Swap" : "Add"}</button>
                <button onClick={() => a.decline()} style={btn(false)}>No thanks</button>
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800, color: c.state === "accepted" ? C.success : C.textSec }}>
                {c.state === "accepted" ? "Added to the ticket ✓" : c.state === "declined" ? "Declined" : c.state === "noted" ? "Noted ✓" : "No answer — moving on"}
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

      {a.auth && a.phase === "active" && a.section ? (
        <div style={{ padding: "8px 12px 9px", borderTop: `1px solid ${C.navyBorder}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>Best in {a.section.category}</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.section.name}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, flexShrink: 0 }}>{a.section.price ? fmt(a.section.price) : "Free"}</span>
          </div>
          <div style={{ fontSize: 10.5, color: C.soft, marginTop: 1 }}>{a.section.why.charAt(0).toUpperCase() + a.section.why.slice(1)}</div>
        </div>
      ) : null}
      {a.auth ? (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", rowGap: 7, padding: "8px 12px", borderTop: `1px solid ${C.navyBorder}`, fontSize: 10.5, color: C.textMuted }}>
          <span style={{ whiteSpace: "nowrap", flex: "1 0 100%" }}>{a.offers.length ? `${a.offers.length} shown · ${a.offers.filter((o) => o.outcome === "accepted").length} taken` : "No upsells yet"}</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button onClick={() => a.setPresenceOn(!a.presenceOn)} style={pill}>{a.presenceOn ? "Camera off" : "Camera on"}</button>
            <CardModeMenu mode={a.cardMode} onChange={a.setCardMode} />
            {a.phase === "active" ? <button onClick={a.endCustomer} style={pill}>End customer</button> : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * When the card changes (useAssist.js CARD_MODES), as a POS-styled menu: a pill with the current
 * setting's short name that opens a panel above it (the square sits low on the screen), each setting
 * with its full name and what it does, the chosen one in lime. Closes on a choice, outside, or Escape.
 */
function CardModeMenu({ mode, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc) }
  }, [open])
  const cur = CARD_MODES[mode] || CARD_MODES.dynamic
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} title="When the upsell on screen changes" aria-haspopup="listbox" aria-expanded={open}
        style={{ ...pill, borderColor: open ? C.accentLine : C.line2, color: open ? C.white : C.muted }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
        {cur.short || cur.label}
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div role="listbox" style={{
          position: "absolute", bottom: "calc(100% + 8px)", right: 0, width: 248, padding: 6, zIndex: 2,
          background: C.raised, border: `1px solid ${C.line2}`, borderRadius: 14, boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint, padding: "6px 8px 4px" }}>When the card changes</div>
          {Object.entries(CARD_MODES).map(([k, m]) => {
            const on = k === mode
            return (
              <button key={k} role="option" aria-selected={on} onClick={() => { onChange(k); setOpen(false) }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginTop: 2, borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${on ? C.accentLine : "transparent"}`, background: on ? C.accentSoft : "transparent", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = C.surface }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: on ? C.accent : C.text }}>{m.label}</div>
                <div style={{ fontSize: 10.5, color: C.soft, lineHeight: 1.35, marginTop: 2 }}>{m.says.charAt(0).toUpperCase() + m.says.slice(1)}.</div>
              </button>
            )
          })}
        </div>
      ) : null}
    </span>
  )
}

/** Items heard without a size: ask for it, one button per size (useAssist.js chooseSize). */
function SizePrompt({ heard, onChoose }) {
  const waiting = (heard || []).filter((h) => h.needsSize)
  if (!waiting.length) return null
  return (
    <div style={{ padding: "9px 12px", borderBottom: `1px solid ${C.navyBorder}`, background: "#F59E0B14" }}>
      {waiting.map((h) => (
        <div key={h.id} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#FBBF24", marginBottom: 5 }}>
            Ask the size: {h.qty > 1 ? `${h.qty}× ` : ""}{h.name}, {h.sizes.join(" or ")}?
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {h.sizes.map((l) => (
              <button key={l} onClick={() => onChoose(h.id, l)} style={{ ...btn(false), padding: "4px 10px", fontSize: 11 }}>{l}</button>
            ))}
          </div>
        </div>
      ))}
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
