import { expect, test } from 'bun:test'
import { resolveNativeRemoteReplay } from './nativeSourceSql'

test('routes historic native sources to BEFORE without confusing annual targets', () => {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_D1_TOKEN
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
  process.env.CLOUDFLARE_D1_TOKEN = 'test-token'
  try {
    const context = {
      sourceTargets: [
        {
          year: 'BEFORE',
          bindingName: 'DB_SOURCE_HK_BEFORE',
          databaseId: 'historical',
        },
        { year: '2026', bindingName: 'DB_SOURCE_HK_2026', databaseId: 'annual' },
      ],
    } as Parameters<typeof resolveNativeRemoteReplay>[1]
    expect(
      resolveNativeRemoteReplay(
        { remote: true, environment: 'preview' },
        context,
        '2015',
      ).target.databaseId,
    ).toBe('historical')
    expect(
      resolveNativeRemoteReplay(
        { remote: true, environment: 'preview' },
        context,
        '2026',
      ).target.databaseId,
    ).toBe('annual')
  } finally {
    if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID
    else process.env.CLOUDFLARE_ACCOUNT_ID = account
    if (token === undefined) delete process.env.CLOUDFLARE_D1_TOKEN
    else process.env.CLOUDFLARE_D1_TOKEN = token
  }
})
