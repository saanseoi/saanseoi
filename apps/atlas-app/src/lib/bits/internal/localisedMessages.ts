import type { locales } from '@repo/i18n/runtime'
import type { m } from '@repo/i18n/messages'

export type AppLocale = (typeof locales)[number]
export type MessageKey = keyof typeof m
