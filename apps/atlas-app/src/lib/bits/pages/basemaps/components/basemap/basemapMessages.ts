import { m, type MessageKey } from '#lib/bits/internal/i18n.js'

export function getBasemapMessage(key: MessageKey) {
  return (m[key] as () => string)()
}
