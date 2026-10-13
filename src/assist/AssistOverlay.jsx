// AssistOverlay.jsx — the only parts of Vavoom Assist on the POS screen itself.
//
// Two floating boxes the cashier can drag anywhere (positions are remembered), and, in the Spotlight
// view, the spotlight over the whole screen. The upsell square can also be made bigger or smaller with
// its corner grip (useScale; remembered per device):
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
//     cashier has open. The footer's card setting (When the card changes) and upsell view (Card or
//     Spotlight) are POS-styled menus. An allergy with no substitute (the brain's "notice") is shown as
//     such, with one "Got it" button. In the Spotlight view the square keeps everything but the card,
//     and says that the upsell comes up over the screen.
//   • the SPOTLIGHT (Spotlight view only; useAssist.js THE SPOTLIGHT) — when an item is said or tapped,
//     the POS blurs and a panel over it names the item, lists what is being weighed while the upsell is
//     worked out (voice print, hot words, allergies, the ticket, the brain), asks for the size when the
//     item has none yet, then shows the upsell with Add / No thanks and, after each answer, the next one
//     in the chain with the chain so far below it. "Back to the order" (or Escape, or a tap on the
//     blur) closes it; it also closes itself when there is nothing more to offer. A Card / Big text switch
//     at its top right changes its look (useAssist.js SPOT_STYLES): the card above, or only the upsell in
//     big text (the item, its price, Add and No thanks), so a customer can pick the one they prefer. Both looks
//     carry a Listening strip (the live words, or the last line heard) and say what speech did: an item said
//     while it is open ("Heard and added: …") and an answer heard ("Added ✓ · heard yes").
//   • the TRANSCRIPT — the live partial line and the last few lines heard (under the spotlight's blur: the
//     spotlight's own Listening strip shows what is being heard, and nothing covers the upsell).
// All state comes from useAssist().

import { useEffect, useRef, useState } from "react"
import { C, fmt } from "../components/posTheme.js"
import { useDraggable, useScale } from "./useDraggable.js"
import { fullBarUrl } from "./assistSync.js"
import { VavoomMark } from "../components/ui.jsx"
import { CARD_MODES, UPSELL_VIEWS, SPOT_STYLES } from "./useAssist.js"

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

// The upsell view menu on the square: the card, or the spotlight in either of its looks (SPOT_STYLES).
const VIEW_CHOICES = {
  card: { label: UPSELL_VIEWS.card.label, short: "Card", says: UPSELL_VIEWS.card.says },
  spotlight: { label: "Spotlight · card", short: "Spotlight", says: `${UPSELL_VIEWS.spotlight.says}; ${SPOT_STYLES.card.says}` },
  text: { label: "Spotlight · big text", short: "Big text", says: `the same spotlight, showing ${SPOT_STYLES.text.says}` },
}

/** The price a card shows: the extra cost of an upsize or a swap over the line it replaces, else its price. */
function cardPrice(c) {
  if (!c || c.kind === "notice") return ""
  const from = c.kind === "upsize" ? c.entry : c.kind === "swap" ? c.fromEntry : null
  const base = from ? (from.sizes.find(([l]) => l === c.fromSize) || from.sizes[0])?.[1] || 0 : 0
  return c.kind === "upsize" || c.kind === "swap" ? `+${fmt(Math.max(0, c.price - base))}` : c.price === 0 ? "Free" : fmt(c.price)
}

function UpsellSquare({ a }) {
  const { pos, boxRef, handleProps, reclamp } = useDraggable("upsell", () => ({ x: Math.max(16, window.innerWidth - 640), y: 76 }))
  const { scale, gripProps } = useScale("upsell", 300)
  useEffect(() => { reclamp() }, [scale, reclamp])
  const s = a.status
  const c = a.card
  const openFullBar = (e) => {
    e.preventDefault()
    window.open(fullBarUrl(), "vavoom-assist-full-bar", "width=1180,height=860")
  }
  // An upsize or a swap (cheese / bacon, an allergy swap) shows the extra cost over the line it replaces.
  const priceText = cardPrice(c)
  const spotlight = a.view === "spotlight"
  const v = a.voice
  return (
    <div ref={boxRef} style={{ ...box, left: pos.x, top: pos.y, width: Math.round(300 * scale) }}>
      {/* Everything inside is laid out at 300 px and zoomed, so text, buttons and spacing all grow together. */}
      <div style={{ zoom: scale, width: 300 }}>
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
        {a.auth && !spotlight && c && c.state === "pending" && a.cardMode === "hold" && !c.pitched ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#FBBF24", marginBottom: 8 }}>Please voice the upsell</div>
        ) : null}
        {!a.auth ? <SignIn onSignIn={a.signIn} /> : spotlight ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.4 }}>
              {a.phase === "active"
                ? "Spotlight is on: when an item is said or tapped, its upsell comes up over the screen."
                : "Spotlight is on. Waiting for a customer at the counter."}
            </div>
            {a.phase !== "active" ? <button onClick={a.startCustomer} style={btn(false)}>Start customer</button> : null}
          </div>
        ) : c ? (
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
            <PillMenu title="When the upsell on screen changes" heading="When the card changes" options={CARD_MODES} value={a.cardMode} fallback="dynamic" onChange={a.setCardMode} />
            <PillMenu title="How the upsell is shown" heading="Upsell view" options={VIEW_CHOICES}
              value={a.view !== "spotlight" ? "card" : a.spotStyle === "text" ? "text" : "spotlight"} fallback="card"
              onChange={(k) => { if (k !== "card") a.setSpotStyle(k === "text" ? "text" : "card"); a.setView(k === "card" ? "card" : "spotlight") }} />
            {a.phase === "active" ? <button onClick={a.endCustomer} style={pill}>End customer</button> : null}
          </span>
        </div>
      ) : null}
      </div>
      <ResizeGrip {...gripProps} />
    </div>
  )
}

/** The corner grip that makes the upsell square bigger or smaller (useScale), mouse or touch. */
function ResizeGrip(props) {
  return (
    <div {...props} aria-label="Resize the upsell card" role="slider"
      style={{ ...props.style, position: "absolute", right: 0, bottom: 0, width: 26, height: 26, display: "flex",
        alignItems: "flex-end", justifyContent: "flex-end", padding: 5, boxSizing: "border-box", borderBottomRightRadius: 14 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M11 4 4 11M11 8 8 11" fill="none" stroke={C.faint} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/**
 * A setting as a POS-styled menu: a pill with the current choice's short name that opens a panel above it
 * (the square sits low on the screen), each choice with its full name and what it does, the chosen one in
 * lime. Closes on a choice, outside, or Escape. Used for when the card changes (useAssist.js CARD_MODES)
 * and for the upsell view (UPSELL_VIEWS); `options` is either map, `fallback` its default key.
 */
function PillMenu({ title, heading, options, value: mode, fallback, onChange }) {
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
  const cur = options[mode] || options[fallback]
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} title={title} aria-haspopup="listbox" aria-expanded={open}
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
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint, padding: "6px 8px 4px" }}>{heading}</div>
          {Object.entries(options).map(([k, m]) => {
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

// The spotlight's entrance and the "working it out" pulse (none for people who turn motion off).
const SPOT_CSS = `
@keyframes vvSpotFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes vvSpotRise { from { opacity: 0; transform: translateY(14px) scale(0.98) } to { opacity: 1; transform: none } }
@keyframes vvSpotPulse { 0%, 100% { opacity: 0.25 } 50% { opacity: 1 } }
.vv-spot-back { animation: vvSpotFade 0.18s ease-out }
.vv-spot-panel { animation: vvSpotRise 0.22s ease-out }
.vv-spot-dot { animation: vvSpotPulse 1s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .vv-spot-back, .vv-spot-panel, .vv-spot-dot { animation: none } }
`
const OUTCOME_MARK = { accepted: ["✓", C.success], declined: ["✗", C.danger], lapsed: ["–", C.faint], noted: ["✓", C.soft] }
/** How an answer came in, when speech gave it: "heard yes", "heard no", "rung up from what was said". */
const viaNote = (via) => (/spoken yes/.test(via || "") ? "heard yes" : /spoken no/.test(via || "") ? "heard no" : /^rung up/.test(via || "") ? "rung up" : "")
/** Items said after the spotlight opened (rung up from speech while it covered the screen), newest last. */
const saidSince = (sp) => (sp.items || []).filter((i) => i.how === "said" && i.at - sp.openedAt > 300)

/**
 * The spotlight's Listening strip: speech keeps working while the spotlight covers the screen, and this shows
 * it (the microphone's level, the words as they come, or the last line heard). `big` is the Big text look.
 */
function HeardStrip({ a, big }) {
  const on = a.status?.stt === "connected" && a.status?.mic === "on"
  const last = (a.lines || []).filter((l) => l.kind !== "explaining").slice(-1)[0]
  const text = a.partial ? `${a.partial}…` : last ? `“${last.text}”` : on ? "Say the upsell; the answer is heard" : "Speech is off: answer by tapping"
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: big ? "center" : "flex-start", minWidth: 0,
      fontSize: big ? 15 : 12.5, color: C.muted, marginTop: big ? 28 : 0 }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: on ? C.success : C.faint,
        boxShadow: on ? `0 0 ${3 + Math.round((a.level || 0) * 14)}px ${C.success}` : "none", transition: "box-shadow 0.1s" }} />
      <span style={{ fontSize: big ? 11 : 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: on ? C.success : C.faint, flexShrink: 0 }}>{on ? "Listening" : "Mic off"}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: a.partial ? "italic" : "normal", color: a.partial ? C.text : C.muted }}>{text}</span>
    </div>
  )
}
const sizeOf = (i) => (i.size ? `${i.size} ` : "")

/** What the spotlight lists while it works out the upsell: the inputs it is weighing right now. */
function weighing(a) {
  const out = []
  const v = a.voice
  out.push(v?.voice_id ? (v.matched ? `Returning voice · heard ${v.seen || (v.visits || 0) + 1}× before` : "New voice · no history yet") : "Listening for the voice print")
  const said = [...new Set((a.hot?.fired || []).map((f) => String(f.label || "").split(" — ")[0]).filter(Boolean))].slice(0, 3)
  if (said.length) out.push(`Hot words: ${said.join(", ")}`)
  if ((a.hot?.allergens || []).length) out.push(`Allergy: ${a.hot.allergens.join(", ").replace(/_/g, " ")}`)
  if ((a.hot?.constraints || []).length) out.push(`Said: ${a.hot.constraints.join(", ").replace(/_/g, " ")}`)
  out.push("The order so far", "Vavoom brain")
  return out
}

/**
 * The spotlight (Spotlight view; useAssist.js THE SPOTLIGHT): the POS blurred, and over it the upsell
 * worked out for the item just said or tapped, then the next in the chain after each answer.
 */
function Spotlight({ a }) {
  const sp = a.spot
  const c = a.card
  const close = useRef(a.closeSpot)
  close.current = a.closeSpot
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") close.current() }
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [])
  const waiting = (a.heard || []).filter((h) => h.needsSize)
  const items = sp.items || []
  const latest = items[items.length - 1]
  const pending = c && c.state === "pending"
  const taken = sp.trail.filter((x) => x.outcome === "accepted").length
  const big = a.spotStyle === "text"
  return (
    <div className="vv-spot-back" onClick={() => a.closeSpot()} style={{
      position: "fixed", inset: 0, zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      background: big ? "rgba(5,7,10,0.66)" : "rgba(5,7,10,0.5)", backdropFilter: "blur(14px) saturate(0.85)", WebkitBackdropFilter: "blur(14px) saturate(0.85)",
    }}>
      <style>{SPOT_CSS}</style>
      <SpotStyleSwitch value={a.spotStyle} onChange={a.setSpotStyle} />
      {big ? <BigText a={a} waiting={waiting} latest={latest} /> : (
      <div className="vv-spot-panel" role="dialog" aria-modal="true" aria-label="Upsell" onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 600, maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, boxShadow: "0 30px 90px rgba(0,0,0,0.6)", color: C.text,
      }}>
        {/* What opened it: the items said or tapped, newest in lime. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <VavoomMark size={22} />
          <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.soft }}>Upsell for</span>
          {items.map((i) => {
            const on = i === latest
            return (
              <span key={i.id} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, height: 26, lineHeight: "26px", padding: "0 11px", borderRadius: 999,
                border: `1px solid ${on ? C.accentLine : C.line2}`, background: on ? C.accentSoft : "transparent", fontSize: 12.5, fontWeight: 500, color: on ? C.accent : C.muted }}>
                {sizeOf(i)}{i.name}<span style={{ fontSize: 10, color: on ? C.accent : C.faint, opacity: 0.8 }}>{i.how}</span>
              </span>
            )
          })}
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          {waiting.length ? (
            <div style={{ marginBottom: c || sp.state === "computing" ? 18 : 0, padding: 14, borderRadius: 16, background: "#F59E0B14", border: "1px solid #F59E0B40" }}>
              {waiting.map((h) => (
                <div key={h.id} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#FBBF24", marginBottom: 10, letterSpacing: "-0.01em" }}>
                    Ask the size: {h.qty > 1 ? `${h.qty}× ` : ""}{h.name}, {h.sizes.join(" or ")}?
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {h.sizes.map((l) => (
                      <button key={l} onClick={() => a.chooseSize(h.id, l)} style={{ height: 44, padding: "0 20px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                        fontSize: 14, fontWeight: 500, border: `1px solid ${C.line2}`, background: C.inset, color: C.white }}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {c ? (
            <>
              <CardTag tag={c.tag} />
              <div style={{ fontSize: 11, fontWeight: 500, color: c.source === "ai" || c.source === "brain" ? "#C084FC" : C.soft, marginBottom: 6 }}>{SOURCE_LABEL[c.source] || c.source}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div style={{ fontSize: 30, fontWeight: 500, lineHeight: 1.12, letterSpacing: "-0.035em", color: C.white }}>{c.title}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: C.accent, letterSpacing: "-0.02em", flexShrink: 0 }}>{cardPrice(c)}</div>
              </div>
              <div style={{ fontSize: 14, color: C.muted, margin: "10px 0 16px", lineHeight: 1.45 }}>{c.back ? "Back to the upsell from before. " : ""}{c.reason}</div>
              {c.pair ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "-4px 0 16px", padding: "10px 12px", borderRadius: 14, background: C.inset, border: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>Goes with it</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.pair.entry.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.accent }}>{fmt(c.pair.price)}</span>
                  {c.pairAdded
                    ? <span style={{ fontSize: 13, fontWeight: 600, color: C.success }}>✓</span>
                    : <button onClick={() => a.addPair()} style={{ ...btn(false), padding: "5px 12px" }}>+ Add</button>}
                </div>
              ) : null}
              {pending && (c.memory || []).length ? (
                <div style={{ margin: "-6px 0 16px", fontSize: 12, color: C.soft, lineHeight: 1.4 }}>
                  Earlier: <span style={{ color: C.text }}>{c.memory.slice().reverse().join(", ")}</span> · comes back after this one
                </div>
              ) : null}
              {pending && c.kind !== "notice" ? (
                <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 12, color: c.pitched ? C.success : "#FBBF24" }}>
                  {c.pitched ? "Said ✓ — waiting for the customer's answer" : "Please voice the upsell"}
                </div>
              ) : null}
              {pending && c.kind === "notice" ? (
                <button onClick={() => a.decline("tapped Got it")} style={{ ...btn(false), width: "100%", height: 52, fontSize: 15 }}>Got it</button>
              ) : pending ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => a.accept()} style={{ ...btn(true), flex: 1, height: 54, fontSize: 16, borderRadius: 999 }}>
                    {c.kind === "upsize" ? "Add upsize" : c.kind === "swap" ? "Swap" : "Add"}
                  </button>
                  <button onClick={() => a.decline()} style={{ ...btn(false), height: 54, padding: "0 22px", fontSize: 14, borderRadius: 999 }}>No thanks</button>
                </div>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 500, color: c.state === "accepted" ? C.success : C.muted }}>
                  {c.state === "accepted" ? "Added to the ticket ✓" : c.state === "declined" ? "Declined" : c.state === "noted" ? "Noted ✓" : "No answer — moving on"}
                  {viaNote(c.via) ? <span style={{ fontSize: 12.5, color: C.soft, marginLeft: 8 }}>· {viaNote(c.via)}</span> : null}
                  <span style={{ fontSize: 12.5, color: C.faint, marginLeft: 10 }}>Next in the chain…</span>
                </div>
              )}
            </>
          ) : sp.state === "done" ? (
            <div style={{ padding: "8px 0" }}>
              <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.03em", color: C.white }}>
                {sp.trail.length ? `That's the chain for the ${latest?.name || "order"}` : `Nothing to add to the ${latest?.name || "order"} right now`}
              </div>
              <div style={{ fontSize: 13, color: C.soft, marginTop: 6 }}>
                {sp.trail.length ? `${taken} of ${sp.trail.length} taken. ` : ""}Back to the order in a moment.
              </div>
            </div>
          ) : !waiting.length || sp.state === "computing" ? (
            <div style={{ padding: "6px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em", color: C.white }}>
                <span aria-hidden="true" style={{ display: "inline-flex", gap: 4 }}>
                  {[0, 1, 2].map((k) => <span key={k} className="vv-spot-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, animationDelay: `${k * 0.18}s` }} />)}
                </span>
                Working out the best upsell for the {latest?.name || "order"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                {weighing(a).map((w) => (
                  <span key={w} style={{ fontSize: 11.5, color: C.muted, padding: "5px 10px", borderRadius: 999, border: `1px solid ${C.line}`, background: C.inset }}>{w}</span>
                ))}
              </div>
            </div>
          ) : null}

          {sp.trail.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.soft }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginRight: 4 }}>Chain</span>
              {sp.trail.map((x, k) => {
                const [mark, col] = OUTCOME_MARK[x.outcome] || ["·", C.faint]
                return <span key={k}><span style={{ color: col, fontWeight: 600 }}>{mark}</span> {x.title}{viaNote(x.via) ? <span style={{ color: C.faint }}> ({viaNote(x.via)})</span> : null}{k < sp.trail.length - 1 || pending ? <span style={{ color: C.faint }}> → </span> : null}</span>
              })}
              {pending ? <span style={{ color: C.accent }}>{c.title} (now)</span> : null}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "11px 20px", borderTop: `1px solid ${C.line}`, background: C.inset }}>
          <HeardStrip a={a} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 20px", borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 11, color: C.faint }}>{sp.trail.length ? `${sp.trail.length} answered · ${taken} taken` : "Answer by voice or tap"}</span>
          <button onClick={() => a.closeSpot()} style={{ height: 38, padding: "0 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
            border: `1px solid ${C.line2}`, background: "transparent", color: C.muted }}>Back to the order</button>
        </div>
      </div>
      )}
    </div>
  )
}

/** The spotlight's Card / Big text switch (SPOT_STYLES), top right over the blur, in the POS's segmented style. */
function SpotStyleSwitch({ value, onChange }) {
  return (
    <div onClick={(e) => e.stopPropagation()} role="radiogroup" aria-label="Spotlight style" style={{
      position: "absolute", top: 16, right: 16, display: "flex", padding: 3, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}`,
    }}>
      {Object.entries(SPOT_STYLES).map(([k, m]) => {
        const on = (value || "card") === k
        return (
          <button key={k} role="radio" aria-checked={on} title={m.says} onClick={() => onChange(k)} style={{
            height: 30, padding: "0 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
            background: on ? C.raised : "transparent", color: on ? C.accent : C.soft, transition: "all 0.15s",
          }}>{m.label}</button>
        )
      })}
    </div>
  )
}

/**
 * The spotlight's Big text style: only the upsell, as large as the screen allows (the item, its price, Add and
 * No thanks), and the size question when the item has none yet. Nothing about why it was picked or the chain:
 * the Card style has those.
 */
function BigText({ a, waiting, latest }) {
  const sp = a.spot
  const c = a.card
  const pending = c && c.state === "pending"
  const huge = { fontSize: "clamp(44px, 7.5vw, 104px)", fontWeight: 500, lineHeight: 1.02, letterSpacing: "-0.045em", color: C.white, margin: 0 }
  const answer = (primary) => ({
    height: 64, padding: "0 34px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em",
    border: primary ? "none" : `1px solid ${C.line2}`, background: primary ? C.accent : "rgba(11,14,20,0.4)", color: primary ? C.accentInk : C.muted,
  })
  let body
  if (c) {
    const done = { accepted: ["Added ✓", C.success], declined: ["No thanks", C.muted], noted: ["Noted ✓", C.soft], lapsed: ["Moving on", C.faint] }[c.state]
    body = (
      <>
        <h1 style={{ ...huge, opacity: pending ? 1 : 0.45 }}>{c.title}</h1>
        {c.kind !== "notice" ? <div style={{ fontSize: "clamp(32px, 5vw, 68px)", fontWeight: 500, letterSpacing: "-0.03em", color: C.accent, marginTop: 14 }}>{cardPrice(c)}</div> : null}
        {pending ? (
          <>
            {c.kind !== "notice" ? (
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 26, color: c.pitched ? C.success : "#FBBF24" }}>{c.pitched ? "Said ✓" : "Please voice the upsell"}</div>
            ) : null}
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
              {c.kind === "notice"
                ? <button onClick={() => a.decline("tapped Got it")} style={answer(false)}>Got it</button>
                : <>
                    <button onClick={() => a.accept()} style={{ ...answer(true), minWidth: 220 }}>{c.kind === "upsize" ? "Add upsize" : c.kind === "swap" ? "Swap" : "Add"}</button>
                    <button onClick={() => a.decline()} style={answer(false)}>No thanks</button>
                  </>}
            </div>
          </>
        ) : (
          <div style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 500, letterSpacing: "-0.03em", color: done?.[1] || C.muted, marginTop: 26 }}>
            {done?.[0] || ""}{viaNote(c.via) ? <span style={{ fontSize: "0.45em", color: C.soft, marginLeft: 12, letterSpacing: "-0.01em" }}>{viaNote(c.via)}</span> : null}
          </div>
        )}
      </>
    )
  } else if (waiting.length) {
    const h = waiting[waiting.length - 1]
    body = (
      <>
        <div style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 500, color: C.muted, letterSpacing: "-0.02em", marginBottom: 12 }}>{h.qty > 1 ? `${h.qty}× ` : ""}{h.name}</div>
        <h1 style={huge}>{h.sizes.join(" or ")}?</h1>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
          {h.sizes.map((l) => <button key={l} onClick={() => a.chooseSize(h.id, l)} style={{ ...answer(false), color: C.white, minWidth: 150 }}>{l}</button>)}
        </div>
      </>
    )
  } else if (sp.state === "done") {
    body = <h1 style={{ ...huge, fontSize: "clamp(36px, 5.5vw, 76px)", color: C.muted }}>{sp.trail.length ? "That's everything" : "Nothing to add"}</h1>
  } else {
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", fontSize: "clamp(26px, 3.6vw, 46px)", fontWeight: 500, letterSpacing: "-0.03em", color: C.muted }}>
        <span aria-hidden="true" style={{ display: "inline-flex", gap: 7 }}>
          {[0, 1, 2].map((k) => <span key={k} className="vv-spot-dot" style={{ width: 12, height: 12, borderRadius: "50%", background: C.accent, animationDelay: `${k * 0.18}s` }} />)}
        </span>
        {latest ? `The best upsell for the ${latest.name}` : "Working it out"}
      </div>
    )
  }
  const joined = saidSince(sp).slice(-1)[0]
  return (
    <div className="vv-spot-panel" role="dialog" aria-modal="true" aria-label="Upsell" onClick={(e) => e.stopPropagation()}
      style={{ width: "100%", maxWidth: 1100, textAlign: "center", padding: "24px 8px", boxSizing: "border-box" }}>
      {joined ? (
        <div style={{ fontSize: "clamp(15px, 1.8vw, 20px)", color: C.success, marginBottom: 22, letterSpacing: "-0.01em" }}>
          Heard and added: {joined.size ? `${joined.size} ` : ""}{joined.name} ✓
        </div>
      ) : null}
      {body}
      <HeardStrip a={a} big />
      <div style={{ marginTop: 28 }}>
        <button onClick={() => a.closeSpot()} style={{ height: 38, padding: "0 18px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
          border: `1px solid ${C.line2}`, background: "transparent", color: C.soft }}>Back to the order</button>
      </div>
    </div>
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

/** The live transcript; `above` lifts it over the spotlight's blur so the conversation stays readable. */
function TranscriptBox({ a, above }) {
  const { pos, boxRef, handleProps } = useDraggable("transcript", () => ({ x: 16, y: Math.max(80, window.innerHeight - 190) }))
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }) }, [a.lines, a.partial])
  const recent = a.lines.slice(-3)
  return (
    <div ref={boxRef} style={{ ...box, left: pos.x, top: pos.y, width: 440, zIndex: above ? 270 : box.zIndex }}>
      <div {...handleProps} style={{ ...handleProps.style, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${C.navyBorder}`, userSelect: "none" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted }}>Transcript</span>
        <div style={{ flex: 1, height: 4, background: C.navy, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(a.level * 100)}%`, height: "100%", background: C.lime, transition: "width 0.1s" }} />
        </div>
      </div>
      <div style={{ padding: "8px 12px", maxHeight: 96, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {recent.length === 0 && !a.partial ? <div style={{ fontSize: 12, color: C.textMuted }}>Waiting for speech…</div> : null}
        {recent.map((l, i) => (
          <div key={`${l.at}-${i}`} style={{ fontSize: 13, lineHeight: 1.35, color: l.kind === "explaining" ? C.faint : i === recent.length - 1 && !a.partial ? C.text : C.textSec, fontStyle: l.kind === "explaining" ? "italic" : "normal" }}
            title={l.kind === "explaining" ? "Explaining the system: shown, not read as the conversation" : undefined}>{l.text}</div>
        ))}
        {a.partial ? <div style={{ fontSize: 13, color: C.text, fontStyle: "italic" }}>{a.partial}…</div> : null}
        <div ref={end} />
      </div>
    </div>
  )
}

export default function AssistOverlay({ assist }) {
  const spot = assist.view === "spotlight" && assist.auth && assist.phase === "active" && assist.spot
  return (
    <>
      <UpsellSquare a={assist} />
      {spot ? <Spotlight a={assist} /> : null}
      {/* Under the spotlight's blur: the spotlight's Listening strip shows what is heard. */}
      <TranscriptBox a={assist} />
    </>
  )
}
