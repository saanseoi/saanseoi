import { createCurrentDb, createHistoryDb, createMetaDb } from '@repo/db'
import { getRequestEvent } from '$app/server'

import { writeServerProductUsage } from '../analytics/productUsage.js'

export function getMetaDb() {
  const binding = getRequestEvent().platform?.env.DB_META
  if (!binding) throw new Error('D1 binding "DB_META" not found.')
  return createMetaDb(binding)
}

export function getCurrentDb() {
  const binding = getRequestEvent().platform?.env.DB_CURRENT
  if (!binding) throw new Error('D1 binding "DB_CURRENT" not found.')
  return createCurrentDb(binding)
}

export function getHistoryDb(bindingName: string) {
  const env = getRequestEvent().platform?.env
  const bindings = {
    DB_HISTORY_HK_BEFORE: env?.DB_HISTORY_HK_BEFORE,
    DB_HISTORY_HK_2025: env?.DB_HISTORY_HK_2025,
    DB_HISTORY_HK_2026: env?.DB_HISTORY_HK_2026,
  }
  const binding = bindings[bindingName as keyof typeof bindings]
  if (!binding) throw new Error(`History D1 binding "${bindingName}" not found.`)
  return createHistoryDb(binding)
}

export function isRegistryBootstrapError(error: unknown) {
  const seen = new Set<unknown>()
  let current = error

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if (
      current instanceof Error &&
      (/no such table: (?:apiReleaseSets|apiVersions|address2d|divisions)/i.test(
        current.message,
      ) ||
        (current.name === 'DrizzleQueryError' &&
          /Failed query:[\s\S]*from "apiReleaseSets"/i.test(current.message)))
    ) {
      return true
    }
    current = 'cause' in current ? current.cause : undefined
  }

  return false
}

export function recordRegistryDataLoad(
  route: string,
  entityType:
    | 'source'
    | 'source_release'
    | 'publisher'
    | 'api'
    | 'api_release'
    | 'data_release'
    | 'district'
    | 'region',
  entityId?: string,
  outcome: 'success' | 'failure' = 'success',
) {
  return writeServerProductUsage({
    event: 'registry.data_load',
    surface: 'registry',
    route,
    entityType,
    entityId,
    outcome,
  })
}
