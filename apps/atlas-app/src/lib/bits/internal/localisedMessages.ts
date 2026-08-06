import type { locales } from '@repo/i18n/runtime'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'

export type AppLocale = (typeof locales)[number]
export type MessageKey = keyof typeof enMessages

const messages = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} satisfies Record<AppLocale, Record<MessageKey, string>>

export function getLocalisedMessage(key: MessageKey, locale: AppLocale) {
  return messages[locale]?.[key] ?? messages.en[key]
}
