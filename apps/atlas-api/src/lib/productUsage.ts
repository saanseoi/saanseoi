import {
  recordProductUsage,
  type ProductUsageDataset,
  type ProductUsageEventInput,
} from '@repo/core/productUsage'
import type { Context } from 'hono'
import type { AppEnv } from '../types'

export function writeProductUsage(
  c: Context<AppEnv>,
  input: Omit<ProductUsageEventInput, 'producer'>,
) {
  recordProductUsage(c.env.PRODUCT_USAGE as ProductUsageDataset | undefined, {
    ...input,
    producer: 'atlas-api',
  })
}

export function isFirstPartyWebOrigin(origin: string | undefined) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    if (url.protocol === 'https:') {
      return url.hostname === 'saanseoi.hk' || url.hostname.endsWith('.saanseoi.hk')
    }
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]')
    )
  } catch {
    return false
  }
}

export function productApiOutcome(status: number) {
  return status >= 200 && status < 400 ? ('success' as const) : ('failure' as const)
}
