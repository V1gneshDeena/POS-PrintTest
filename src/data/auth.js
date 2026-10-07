// Operator identity — not a login. The operator types their name on the
// name bar (AuthScreen) and that's the whole flow. The name is printed on
// every receipt so the interceptor can attribute upsells per operator.

export function makeOperator(name) {
  return {
    id: `op-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    role: "Operator",
    shift: "Current",
  }
}

export function saveSession(user) {
  sessionStorage.setItem("pos_user", JSON.stringify(user))
}

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem("pos_user"))
  } catch {
    return null
  }
}

export function clearSession() {
  sessionStorage.removeItem("pos_user")
}
