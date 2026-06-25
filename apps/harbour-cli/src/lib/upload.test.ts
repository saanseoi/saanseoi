import { describe, expect, test } from 'bun:test'

import type { ParsedArgs, UploadTarget } from './options.ts'
import { resolveHarbourApiUrl, resolveHarbourBaseUrl } from './upload.ts'

describe('resolveHarbourBaseUrl', () => {
  test('uses the current custom domains for remote environments', () => {
    expect(resolveHarbourBaseUrl({ environment: 'preview', remote: true })).toBe(
      'https://preview.harbour.saanseoi.hk',
    )
    expect(resolveHarbourBaseUrl({ environment: 'production', remote: true })).toBe(
      'https://harbour.saanseoi.hk',
    )
  })
})

describe('resolveHarbourApiUrl', () => {
  test('falls back to the target base URL when no override is configured', () => {
    const args: ParsedArgs = {
      command: 'upload',
      options: {},
      positionals: [],
    }
    const target: UploadTarget = {
      environment: 'preview',
      remote: true,
    }

    expect(resolveHarbourApiUrl(args, target)).toBe(resolveHarbourBaseUrl(target))
  })
})
