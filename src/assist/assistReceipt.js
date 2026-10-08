// assistReceipt.js — the paid visit's Vavoom Assist record, handed from useAssist to the receipt.
//
// When a payment completes, useAssist captures the visit (the voice print, the conversation with
// who said each line, and every upsell shown: why, whether the employee said it, and whether it
// was accepted, declined or let lapse) BEFORE the visit resets, and sends it to the brain's store
// on the GPU box. usePos prints the receipt a moment later in the same click, and printer.js reads
// the record from here to add it to the printed receipt and the digital printer's order. A record
// older than a minute is ignored, so a later receipt never carries an earlier visit.

let last = null

export function setAssistReceipt(record) {
  last = record ? { ...record, capturedAt: Date.now() } : null
}

export function getAssistReceipt() {
  return last && Date.now() - last.capturedAt < 60000 ? last : null
}
