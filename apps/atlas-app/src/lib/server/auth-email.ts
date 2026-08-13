import { getLocale } from '@repo/i18n/runtime'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'
import { userLocales } from '@repo/db'

const messages = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} as const

type AuthLocale = (typeof userLocales)[number]
type AuthEmailKind = 'reset' | 'verify'
type AuthMessageKey =
  | 'auth_reset_subject'
  | 'auth_verify_subject'
  | 'auth_email_verify_heading'
  | 'auth_email_verify_intro'
  | 'auth_email_verify_action'
  | 'auth_email_verify_expiry'
  | 'auth_email_verify_ignore'
  | 'auth_email_reset_heading'
  | 'auth_email_reset_intro'
  | 'auth_email_reset_action'
  | 'auth_email_reset_expiry'
  | 'auth_email_reset_ignore'
  | 'auth_email_greeting'
  | 'auth_email_greeting_fallback'
  | 'auth_email_fallback'
  | 'auth_email_visit'
  | 'auth_email_privacy'
  | 'auth_email_terms'

const toAuthLocale = (locale: string | null | undefined): AuthLocale | null =>
  userLocales.find(candidate => candidate.toLowerCase() === locale?.toLowerCase()) ??
  null

const getEmailLocale = (preferredLocale: string | null | undefined): AuthLocale =>
  toAuthLocale(preferredLocale) ?? toAuthLocale(getLocale()) ?? 'en'

const getAuthMessage = (locale: AuthLocale, key: AuthMessageKey) =>
  messages[locale][key]

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character] ?? character
  })

const getDisplayName = (name: string | null | undefined) =>
  name?.trim().replace(/\s+/g, ' ') || null

/**
 * Creates the plain-text and table-based HTML email used for Better Auth account actions.
 * Inline styles and a plain-text alternative keep the message usable in restrictive email clients.
 */
export const createAuthEmail = (
  kind: AuthEmailKind,
  preferredLocale: string | null | undefined,
  url: string,
  recipientName?: string | null,
) => {
  const locale = getEmailLocale(preferredLocale)
  const isReset = kind === 'reset'
  const subject = getAuthMessage(
    locale,
    isReset ? 'auth_reset_subject' : 'auth_verify_subject',
  )
  const heading = getAuthMessage(
    locale,
    isReset ? 'auth_email_reset_heading' : 'auth_email_verify_heading',
  )
  const intro = getAuthMessage(
    locale,
    isReset ? 'auth_email_reset_intro' : 'auth_email_verify_intro',
  )
  const action = getAuthMessage(
    locale,
    isReset ? 'auth_email_reset_action' : 'auth_email_verify_action',
  )
  const expiry = getAuthMessage(
    locale,
    isReset ? 'auth_email_reset_expiry' : 'auth_email_verify_expiry',
  )
  const reassurance = getAuthMessage(
    locale,
    isReset ? 'auth_email_reset_ignore' : 'auth_email_verify_ignore',
  )
  const displayName = getDisplayName(recipientName)
  const greeting = displayName
    ? getAuthMessage(locale, 'auth_email_greeting').replace('{name}', () => displayName)
    : getAuthMessage(locale, 'auth_email_greeting_fallback')
  const fallback = getAuthMessage(locale, 'auth_email_fallback')
  const visit = getAuthMessage(locale, 'auth_email_visit')
  const privacy = getAuthMessage(locale, 'auth_email_privacy')
  const terms = getAuthMessage(locale, 'auth_email_terms')
  const baseURL = getRequestOrigin(url)
  const privacyURL = new URL('/policy/privacy', baseURL).toString()
  const termsURL = new URL('/policy/terms', baseURL).toString()

  const text = [
    greeting,
    '',
    intro,
    '',
    `${action}: ${url}`,
    '',
    expiry,
    reassurance,
    '',
    `${visit}: ${baseURL}/`,
    `${privacy}: ${privacyURL}`,
    `${terms}: ${termsURL}`,
  ].join('\n')

  const safe = {
    action: escapeHtml(action),
    baseURL: escapeHtml(baseURL),
    fallback: escapeHtml(fallback),
    greeting: escapeHtml(greeting),
    heading: escapeHtml(heading),
    intro: escapeHtml(intro),
    privacy: escapeHtml(privacy),
    privacyURL: escapeHtml(privacyURL),
    reassurance: escapeHtml(reassurance),
    terms: escapeHtml(terms),
    termsURL: escapeHtml(termsURL),
    url: escapeHtml(url),
    visit: escapeHtml(visit),
  }

  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="${locale === 'en' ? 'en' : 'zh'}">
  <body style="margin:0;padding:0;background:#f4f7f3;color:#10231d;font-family:Arial,'Helvetica Neue',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safe.intro}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7f3;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fffdf8;border:1px solid #dce8df;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:28px 32px;background:#00201b;color:#ffffff;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9cebdc;">山水</p>
            <p style="margin:6px 0 0;font-size:24px;line-height:1.2;font-weight:700;color:#ffffff;">SaanSeoi</p>
          </td></tr>
          <tr><td style="padding:36px 32px 16px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#2c7568;">SaanSeoi</p>
            <h1 style="margin:0;font-size:28px;line-height:1.2;color:#10231d;">${safe.heading}</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 36px;font-size:16px;line-height:1.6;color:#33443e;">
            <p style="margin:0 0 16px;">${safe.greeting}</p>
            <p style="margin:0 0 24px;">${safe.intro}</p>
            <p style="margin:0 0 24px;">
              <a href="${safe.url}" style="display:inline-block;padding:13px 22px;background:#007b66;border:1px solid #007b66;border-radius:9px;color:#ffffff;font-weight:700;text-decoration:none;">${safe.action}</a>
            </p>
            <p style="margin:0 0 5px;font-size:13px;color:#687972;">${safe.fallback}</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safe.url}" style="color:#276c61;text-decoration:underline;">${safe.url}</a></p>
            <p style="margin:0 0 12px;font-size:14px;color:#687972;">${escapeHtml(expiry)}</p>
            <p style="margin:0;font-size:14px;color:#687972;">${safe.reassurance}</p>
          </td></tr>
          <tr><td style="padding:22px 32px;background:#eef5ef;font-size:13px;line-height:1.6;color:#52665e;">
            <p style="margin:0 0 8px;"><a href="${safe.baseURL}/" style="color:#276c61;font-weight:700;text-decoration:none;">${safe.visit}</a></p>
            <p style="margin:0;"><a href="${safe.privacyURL}" style="color:#52665e;text-decoration:underline;">${safe.privacy}</a> &nbsp;·&nbsp; <a href="${safe.termsURL}" style="color:#52665e;text-decoration:underline;">${safe.terms}</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  }
}

const getRequestOrigin = (url: string) => {
  const parsedURL = new URL(url)
  return parsedURL.origin
}
