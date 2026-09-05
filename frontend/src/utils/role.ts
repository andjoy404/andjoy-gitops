export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'admin'
}

export function persistSessionRole(role: string | null | undefined): void {
  const normalized = (role ?? '').trim().toLowerCase()
  if (!normalized) return
  try {
    localStorage.setItem('user_role', normalized)
  } catch {
    // localStorage unavailable (private mode/quota) — role persistence is best-effort
  }
}

export function persistSessionUsername(username: string | null | undefined): void {
  const normalized = (username ?? '').trim()
  if (!normalized) return
  try {
    localStorage.setItem('user_username', normalized)
  } catch {
    // localStorage unavailable (private mode/quota) — username persistence is best-effort
  }
}

