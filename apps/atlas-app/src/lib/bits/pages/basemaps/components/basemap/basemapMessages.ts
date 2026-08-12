import { m, type MessageKey } from '$lib/bits/internal/i18n'

export function getBasemapMessage(key: MessageKey) {
  return m[key]()
}
