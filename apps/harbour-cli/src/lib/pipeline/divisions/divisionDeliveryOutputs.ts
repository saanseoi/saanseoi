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
  return outputs as Record<(typeof countKeys)[number], number>
}
