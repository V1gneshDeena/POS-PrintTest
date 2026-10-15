// Dump every spoken line of a transcript set as JSONL, for the demopos meaning layer's evaluation
// on the GPU box (deploy/gpu-vllm/demopos/eval/meaning_eval.py and probe files), one record per line:
// { set, id, split, text, prev, labels: null, kind }.
//
//   node test/dump-lines.mjs edits OUT.jsonl      (edits = test/order-edits.js, main = test/transcripts.js)
import { writeFileSync } from "node:fs"

const [, , which = "edits", out = "lines.jsonl"] = process.argv
const mod = which === "main" ? await import("./transcripts.js") : await import("./order-edits.js")
const rows = []
for (const t of mod.TRANSCRIPTS) {
  let prev = ""
  for (const s of t.steps) {
    if (!s.say) continue
    rows.push({ set: which, id: `${which[0]}${t.id}-${rows.length}`, split: "test", text: s.say, prev, labels: null, kind: t.kind || "" })
    prev = s.say
  }
}
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
console.log(`${rows.length} lines -> ${out}`)
