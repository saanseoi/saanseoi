import { describe, expect, it } from 'vitest'
import { createAuthEmail } from './auth-email'

describe('createAuthEmail', () => {
  it('builds a branded password-reset email with a safe fallback link', () => {
    const email = createAuthEmail(
      'reset',
      'en',
      'https://saanseoi.hk/api/auth/reset-password?token=abc&callbackURL=%2F',
      '<Avery>',
    )

    expect(email.subject).toBe('Reset your SaanSeoi password')
    expect(email.text).toContain('Hi <Avery>,')
    expect(email.text).toContain(
      'Reset password: https://saanseoi.hk/api/auth/reset-password',
    )
    expect(email.html).toContain('Reset your password')
    expect(email.html).toContain('background:#007b66')
    expect(email.html).toContain('Hi &lt;Avery&gt;,')
    expect(email.html).not.toContain('Hi <Avery>,')
    expect(email.html).toContain(
      'href="https://saanseoi.hk/api/auth/reset-password?token=abc&amp;callbackURL=%2F"',
    )
    expect(email.html).toContain('https://saanseoi.hk/policy/privacy')
    expect(email.html).toContain('https://saanseoi.hk/policy/terms')
  })

  it('uses verification copy and the selected locale', () => {
    const email = createAuthEmail(
      'verify',
      'zh-Hant',
      'https://saanseoi.hk/api/auth/verify-email?token=abc',
    )

    expect(email.subject).toBe('驗證你的 SaanSeoi 電郵地址')
    expect(email.text).toContain('請確認你的電郵地址')
    expect(email.html).toContain('驗證你的電郵地址')
    expect(email.html).toContain('你好：')
  })

  it('inserts display names literally in the greeting', () => {
    const email = createAuthEmail(
      'verify',
      'en',
      'https://saanseoi.hk/api/auth/verify-email?token=abc',
      'Avery $&',
    )

    expect(email.text).toContain('Hi Avery $&,')
  })
})
