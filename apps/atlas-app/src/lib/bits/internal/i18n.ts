import { getLocale, locales, setLocale } from '@repo/i18n/runtime'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'

export { getLocale, locales, setLocale }

export type AppLocale = (typeof locales)[number]
type MessageKey = keyof typeof enMessages

const messages = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} satisfies Record<AppLocale, Record<MessageKey, string>>

function resolveMessage(key: MessageKey) {
  const locale = getLocale() as AppLocale
  return messages[locale]?.[key] ?? messages.en[key]
}

export const m = new Proxy({} as { [K in MessageKey]: () => string }, {
  get: (_, property) => {
    const key = property as MessageKey
    return () => resolveMessage(key)
  },
})

export const localeOptions = [
  { value: 'en', label: () => m.language_option_en() },
  { value: 'zh-Hant', label: () => m.language_option_zh_hant() },
  { value: 'zh-Hans', label: () => m.language_option_zh_hans() },
] as const satisfies ReadonlyArray<{ value: AppLocale; label: () => string }>
