import { sourceSchema, inArray } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { censtatdGeometryId } from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { chunkArray } from '@repo/core/pipeline/utils'

export async function inspectCenstatdGeometryReuse(
  db: HarbourReadableDb,
  rows: Array<{ sourceGeometry: unknown }>,
) {
  const ids = [...new Set(rows.map(row => censtatdGeometryId(row.sourceGeometry)))]
  const table = sourceSchema.sourceHkgovCenstatdGeometry
  let reused = 0
  for (const chunk of chunkArray(ids, 90)) {
    reused += (
      await db
        .select({ id: table.id })
        .from(table)
        .where(inArray(table.id, chunk))
        .all()
    ).length
  }
  return { created: ids.length - reused, reused, references: rows.length }
}

export function formatCenstatdGeometryReuse(counts: {
  created: number
  reused: number
  references: number
}) {
  return `Source geometry: ${counts.created} new, ${counts.reused} reused, ${counts.references} references`
}

export async function describeCenstatdGeometryReuse(
  db: HarbourReadableDb,
  rows: Array<{ sourceGeometry: unknown }>,
) {
  return formatCenstatdGeometryReuse(await inspectCenstatdGeometryReuse(db, rows))
}
