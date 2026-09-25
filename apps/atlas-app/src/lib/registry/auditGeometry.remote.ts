import { query } from '$app/server'
import { z } from 'zod'
import { readAuditGeometry } from './auditGeometry'
import { getCurrentDb, getHistoryDb, getMetaDb } from './server'

export const getAuditGeometry = query(
  z.object({ resourceReleaseId: z.string(), divisionId: z.string() }),
  ({ resourceReleaseId, divisionId }) =>
    readAuditGeometry({
      resourceReleaseId,
      divisionId,
      currentDb: getCurrentDb(),
      metaDb: getMetaDb(),
      getHistoryDb,
    }),
)
