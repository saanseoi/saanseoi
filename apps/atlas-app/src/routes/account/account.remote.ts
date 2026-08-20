import { redirect } from '@sveltejs/kit'
import { command, getRequestEvent, query } from '$app/server'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'
import { userLocales } from '@repo/db'
import { z } from 'zod'

const unlinkAccountSchema = z.object({
  accountId: z.string(),
  locale: z.enum(userLocales),
})

const setPasswordSchema = z.object({
  password: z.string(),
  locale: z.enum(userLocales),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  locale: z.enum(userLocales),
})

const deletePasskeySchema = z.object({
  id: z.string(),
  locale: z.enum(userLocales),
})

type AccountLocale = (typeof userLocales)[number]
type AccountMessageKey =
  | 'account_unlink_error'
  | 'account_last_sign_in_method'
  | 'account_sign_in_method_not_found'
  | 'account_password_invalid'
  | 'account_password_add_error'
  | 'account_password_added'
  | 'account_new_password_invalid'
  | 'account_password_change_error'
  | 'account_current_password_not_accepted'
  | 'account_password_changed'
  | 'account_passkey_remove_error'

const messages = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} as const

const getAccountMessage = (locale: AccountLocale, key: AccountMessageKey) =>
  messages[locale][key]

const passwordIsValid = (password: string) =>
  password.length >= 8 && password.length <= 128

const requireUser = () => {
  const event = getRequestEvent()
  return event.locals.user ? event : null
}

export const getAccountPageData = query(async () => {
  const event = getRequestEvent()
  if (!event.locals.user) redirect(303, '/sign-in?next=/account')

  const [accounts, passkeys] = await Promise.all([
    event.locals.auth.api.listUserAccounts({ headers: event.request.headers }),
    event.locals.auth.api.listPasskeys({ headers: event.request.headers }),
  ])

  return {
    user: {
      email: event.locals.user.email,
    },
    accounts,
    passkeys,
  }
})

export const unlinkAccountForCurrentUser = command(
  unlinkAccountSchema,
  async ({ accountId, locale }) => {
    const event = requireUser()
    if (!event)
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_unlink_error'),
      } as const

    const accounts = await event.locals.auth.api.listUserAccounts({
      headers: event.request.headers,
    })
    if (accounts.length <= 1) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_last_sign_in_method'),
      } as const
    }

    // Better Auth 1.7's unlink endpoint expects the local account record ID.
    const account = accounts.find(account => account.id === accountId)
    if (!account) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_sign_in_method_not_found'),
      } as const
    }

    await event.locals.auth.api.unlinkAccount({
      headers: event.request.headers,
      body: { accountId: account.id },
    })
    await getAccountPageData().refresh()

    return { ok: true } as const
  },
)

export const deletePasskeyForCurrentUser = command(
  deletePasskeySchema,
  async ({ id, locale }) => {
    const event = requireUser()
    if (!event)
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_passkey_remove_error'),
      } as const

    const [accounts, passkeys] = await Promise.all([
      event.locals.auth.api.listUserAccounts({ headers: event.request.headers }),
      event.locals.auth.api.listPasskeys({ headers: event.request.headers }),
    ])
    if (
      accounts.length + passkeys.length <= 1 ||
      !passkeys.some(passkey => passkey.id === id)
    ) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_passkey_remove_error'),
      } as const
    }

    try {
      await event.locals.auth.api.deletePasskey({
        headers: event.request.headers,
        body: { id },
      })
    } catch {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_passkey_remove_error'),
      } as const
    }

    await getAccountPageData().refresh()
    return { ok: true } as const
  },
)

export const addPasswordForCurrentUser = command(
  setPasswordSchema,
  async ({ password, locale }) => {
    if (!passwordIsValid(password)) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_password_invalid'),
      } as const
    }

    const event = requireUser()
    if (!event) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_password_add_error'),
      } as const
    }

    try {
      await event.locals.auth.api.setPassword({
        headers: event.request.headers,
        body: { newPassword: password },
      })
    } catch {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_password_add_error'),
      } as const
    }

    await getAccountPageData().refresh()
    return {
      ok: true,
      message: getAccountMessage(locale, 'account_password_added'),
    } as const
  },
)

export const changePasswordForCurrentUser = command(
  changePasswordSchema,
  async ({ currentPassword, newPassword, locale }) => {
    if (!passwordIsValid(newPassword)) {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_new_password_invalid'),
      } as const
    }

    const event = requireUser()
    if (!event)
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_password_change_error'),
      } as const

    try {
      await event.locals.auth.api.changePassword({
        headers: event.request.headers,
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        },
      })
    } catch {
      return {
        ok: false,
        message: getAccountMessage(locale, 'account_current_password_not_accepted'),
      } as const
    }

    return {
      ok: true,
      message: getAccountMessage(locale, 'account_password_changed'),
    } as const
  },
)
