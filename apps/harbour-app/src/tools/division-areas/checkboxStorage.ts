/** Browser preferences are optional: unavailable storage must not block map controls. */
export function readCheckboxSelection(
  key: string,
  defaults: string[] = [],
): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(saved) && saved.every(value => typeof value === 'string'))
      return new Set(saved)
  } catch {
    // Keep the defaults when storage is unavailable or malformed.
  }
  return new Set(defaults)
}

export function writeCheckboxSelection(key: string, selected: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...selected]))
  } catch {
    // The controls remain usable when browser storage is unavailable or full.
  }
}
