import type { locales } from '@repo/i18n/runtime'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'

export type AppLocale = (typeof locales)[number]
export type MessageKey = keyof typeof enMessages

// TODO - undo this change as soon as we have will guides in Chinese
const messages: Record<AppLocale, Partial<Record<MessageKey, string>>> = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
}

export function getLocalisedMessage(key: MessageKey, locale: AppLocale) {
  return messages[locale]?.[key] ?? enMessages[key]
}
