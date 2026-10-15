// Browser globals the Assist modules read, for running them under Node (imported first by
// run-transcripts.mjs). The demo room id is a test id; nothing here talks to a network.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
  clear: () => store.clear(),
}
globalThis.sessionStorage = globalThis.localStorage
globalThis.window = { location: { search: "?demo=demo-transcript-test&menu=burgers", hostname: "localhost", href: "http://localhost/?demo=demo-transcript-test&menu=burgers", origin: "http://localhost", pathname: "/" } }
