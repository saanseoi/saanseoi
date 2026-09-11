import { query } from '$app/server'
import { z } from 'zod'
import { readAuditGeometry } from './auditGeometry'
import { getCurrentDb, getHistoryDb, getMetaDb } from './server'

export const getAuditGeometry = query(
  z.object({ releaseId: z.string(), divisionId: z.string() }),
  ({ releaseId, divisionId }) =>
    readAuditGeometry({
      releaseId,
      divisionId,
      currentDb: getCurrentDb(),
      metaDb: getMetaDb(),
      getHistoryDb,
    }),
)
