// Self-check for src/services/scanner.js. Run: node scripts/check-scanner.mjs
import assert from "node:assert/strict"
import { matchScan, listenForScans } from "../src/services/scanner.js"
import { MENU } from "../src/data/menu-fiveguys.js"

// Matching
let m = matchScan("fgprod_0002", MENU)
assert.equal(m.type, "item"); assert.equal(m.item.name, "Cheeseburger"); assert.equal(m.size, undefined)
m = matchScan("FGPROD_0002:regular", MENU)
assert.equal(m.item.name, "Cheeseburger"); assert.equal(m.size, "Regular")
m = matchScan("fgprod_0002:Huge", MENU)
assert.equal(m.size, undefined) // unknown size → size picker
assert.deepEqual(matchScan(" 6012345678 ", MENU), { type: "loyalty", id: "6012345678" })
// Card swipes (track 1 / track 2) are never kept
assert.equal(matchScan("%B4111111111111111^DOE/JANE^29121010000000000000?", MENU).type, "ignored")
assert.equal(matchScan(";4111111111111111=29121010000000000?", MENU).type, "ignored")

// Burst detection: fast keys + Enter is a scan, slow typing is not
globalThis.window = new EventTarget()
const scans = []
listenForScans((c) => scans.push(c))
const key = (k) => { const e = new Event("keydown"); e.key = k; window.dispatchEvent(e) }
for (const k of "fgprod_0002") key(k)
key("Enter")
assert.deepEqual(scans, ["fgprod_0002"])
for (const k of "1234") { key(k); await new Promise((r) => setTimeout(r, 80)) }
key("Enter")
assert.deepEqual(scans, ["fgprod_0002"]) // human typing ignored

console.log("scanner ok")
