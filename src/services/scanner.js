// Barcode / loyalty scanner.
// USB and Bluetooth scanners act as keyboards: they "type" the code as a fast
// burst of keys and finish with Enter. Barcodes on items encode the menu item id
// ("fgprod_0002"), optionally with a size ("fgprod_0002:Regular"). Any other code
// is taken as a loyalty card number.

// ponytail: fixed gap; scanners send keys ~5-30 ms apart, people ~100 ms+. Raise it
// if a slow Bluetooth scanner's codes get split, lower it if fast typists trip it.
const SCAN_GAP_MS = 50
const MIN_LENGTH = 4

/** Listen for scanner bursts anywhere on the page. Returns an unsubscribe function. */
export function listenForScans(onScan) {
  let buf = ""
  let last = 0
  const onKey = (e) => {
    // Typing in a field (the operator name, Assist's text box) is never a scan.
    if (e.target?.closest?.("input, textarea, [contenteditable]")) return
    const now = performance.now()
    if (now - last > SCAN_GAP_MS) buf = ""
    last = now
    if (e.key === "Enter") {
      if (buf.length >= MIN_LENGTH) { e.preventDefault(); onScan(buf) }
      buf = ""
    } else if (e.key.length === 1) {
      buf += e.key
    }
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}

/**
 * What a scanned code means against a menu ({ category: [item] }):
 *   { type: "item", item, category, size? }  size only when the code named a valid one
 *   { type: "loyalty", id }
 */
export function matchScan(code, menu) {
  const [id, sizeCode] = code.trim().split(":")
  for (const [category, items] of Object.entries(menu)) {
    const item = items.find((i) => i.id.toLowerCase() === id.toLowerCase())
    if (!item) continue
    const size = sizeCode && Object.keys(item.sizes).find((s) => s.toLowerCase() === sizeCode.toLowerCase())
    return { type: "item", item, category, ...(size ? { size } : {}) }
  }
  return { type: "loyalty", id: code.trim() }
}
