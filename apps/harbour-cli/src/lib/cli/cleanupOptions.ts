import { resourceTypes } from '@repo/core'
import type { ResourceType } from '@repo/core'

export function resolveSnapshotCleanupResourceType(
  value: string | boolean | undefined,
): ResourceType | undefined {
  if (value === undefined || value === false) {
    return undefined
  }

  if (
    typeof value === 'string' &&
    (resourceTypes as readonly string[]).includes(value)
  ) {
    return value as ResourceType
  }

  throw new Error(
    `Unsupported snapshot cleanup type: ${String(value)}. Use division, divisionArea, divisionBoundary, address, street, or place.`,
  )
}

export function resolveSnapshotIds(value: string | boolean | undefined) {
  if (typeof value !== 'string') {
    return undefined
  }

  const snapshotIds = value
    .split(',')
    .map(snapshotId => snapshotId.trim())
    .filter(Boolean)

  if (snapshotIds.length === 0) {
    throw new Error('Invalid --snapshot value. Expected one or more snapshot IDs.')
  }

  return snapshotIds
}

export function resolveDelaySeconds(value: string | boolean | undefined) {
  if (value === undefined || value === false) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid --delay-seconds value.')
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('Invalid --delay-seconds value. Expected a non-negative integer.')
  }

  const delaySeconds = Number(value)

  if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
    throw new Error('Invalid --delay-seconds value. Expected a non-negative integer.')
  }

  return delaySeconds
}
