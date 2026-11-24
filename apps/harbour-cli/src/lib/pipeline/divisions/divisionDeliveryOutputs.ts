import type { ObjectRef } from '@repo/core/provenance'

const countKeys = [
  'sqlArtefactCount',
  'deletedRows',
  'insertedVersions',
  'processedRows',
  'unchangedRows',
  'localisedRows',
] as const

/** Completion reports must describe the sealed SQL, not a partially replayed mirror. */
export function readDivisionDeliveryOutputs(
  outputs: Record<string, unknown> | undefined,
) {
  for (const key of countKeys) {
    const value = outputs?.[key]
    if (!Number.isSafeInteger(value) || (value as number) < 0)
      throw new Error(`Retained Division SQL ${key} is missing or invalid.`)
  }
  const ref = outputs?.assemblyAuditRef as Partial<ObjectRef> | undefined
  if (
    !ref ||
    typeof ref.hash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(ref.hash) ||
    !Number.isSafeInteger(ref.byteLength) ||
    (ref.byteLength as number) <= 0
  )
    throw new Error('Retained Division assembly audit reference is missing or invalid.')
  return outputs as Record<(typeof countKeys)[number], number> & {
    assemblyAuditRef: ObjectRef
  }
}
