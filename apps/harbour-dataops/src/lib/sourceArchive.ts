import { createHash } from 'node:crypto'

export function isSha256(value: string | boolean | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

export function assertSourceArchiveHash(
  bytes: Uint8Array,
  expectedSha256: string,
  label = 'Prepared source archive',
) {
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(
      `${label} SHA-256 differs from its updater manifest: expected ${expectedSha256}, found ${actualSha256}.`,
    )
  }
}
