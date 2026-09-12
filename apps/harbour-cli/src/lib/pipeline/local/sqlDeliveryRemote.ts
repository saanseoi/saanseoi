import { addD1RowUsage, readD1RowUsage } from './sqlDeliveryUsage.ts'
import { createHash } from 'node:crypto'
import {
  createD1ImportClient,
  type D1ImportFetch,
  type D1ImportPollResult,
} from '@repo/core/d1ImportApi'
import { createCloudflareD1QueryClient } from '../../dbCache/remoteD1Client.ts'
import { preRetireAddressSources } from './addressSourceRetirement.ts'
import {
  RECEIPT_SCHEMA_SQL,
  RECEIPT_TABLE,
  checkReceipt,
  receiptQuery,
  receiptSql,
} from './sqlDeliveryReceipts.ts'
import type {
  SqlDeliveryBatch,
  SqlDeliveryCheckpoint,
  SqlDeliveryPlan,
} from './sqlDeliveryTypes.ts'

export type SqlDeliveryRemoteOptions = {
  accountId: string
  apiToken: string
  fetch?: D1ImportFetch
  pollIntervalMs?: number
}

export function createSqlDeliveryRemote(options: SqlDeliveryRemoteOptions) {
  const tables = new Set<string>()
  const query = (databaseId: string) =>
    createCloudflareD1QueryClient({ ...options, databaseId })
  const prepareSourceRetirement = async (
    plan: SqlDeliveryPlan,
    batch: SqlDeliveryBatch,
    statements: Array<{ sql: string; params: unknown[] }>,
    state: SqlDeliveryCheckpoint,
    save: () => Promise<void>,
  ) => {
    if (
      plan.context.phase === 'address3d-data' &&
      batch.target.bindingName.startsWith('DB_SOURCE_')
    )
      await preRetireAddressSources(statements, async sql => {
        state.usagePending = true
        await save()
        const rows = await createCloudflareD1QueryClient({
          ...options,
          databaseId: batch.target.databaseId,
          retryLimit: 0,
          onMeta: meta => {
            addD1RowUsage(state, readD1RowUsage(meta))
          },
        }).query(sql)
        state.usagePending = false
        await save()
        return rows
      })
  }
  const hasReceipt = async (plan: SqlDeliveryPlan, batch: SqlDeliveryBatch) => {
    if (!tables.has(batch.target.databaseId)) {
      const rows = await query(batch.target.databaseId).query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${RECEIPT_TABLE}';`,
      )
      if (rows.length === 0) return false
      tables.add(batch.target.databaseId)
    }
    return checkReceipt(
      await query(batch.target.databaseId).query(receiptQuery(plan, batch)),
      batch,
    )
  }
  return {
    hasReceipt,
    /** Preserve sealed batch identities while amortising transport across pending writes. */
    async deliverBoundGroup(
      plan: SqlDeliveryPlan,
      entries: Array<{
        batch: SqlDeliveryBatch
        bytes: Uint8Array
        state: SqlDeliveryCheckpoint
      }>,
      save: () => Promise<void>,
    ) {
      const databaseId = entries[0]?.batch.target.databaseId
      if (
        !databaseId ||
        entries.length > 8 ||
        entries.some(
          entry =>
            entry.batch.kind !== 'bound' ||
            entry.batch.target.databaseId !== databaseId,
        )
      )
        throw new Error('Invalid bound delivery group.')
      const decoded = entries.map(entry => ({
        ...entry,
        statements: JSON.parse(new TextDecoder().decode(entry.bytes)) as Array<{
          sql: string
          params: unknown[]
        }>,
      }))
      if (
        entries.reduce((n, entry) => n + entry.bytes.byteLength, 0) > 8 * 1024 * 1024 ||
        decoded.reduce((n, entry) => n + entry.statements.length, 0) > 512
      )
        throw new Error('Bound delivery group budget exceeded.')
      const existing = await this.confirmedReceipts(
        plan,
        entries.map(entry => entry.batch),
      )
      const pending = decoded.filter(entry => !existing.has(entry.batch.index))
      for (const entry of pending) {
        if (entry.state.status !== 'pending')
          throw new Error(
            `Bound batch ${entry.batch.index} has an uncertain outcome without a receipt; no writes were repeated.`,
          )
      }
      for (const entry of pending) {
        if (entry.state.usagePending)
          addD1RowUsage(entry.state, readD1RowUsage(undefined))
      }
      for (const entry of pending)
        await prepareSourceRetirement(
          plan,
          entry.batch,
          entry.statements,
          entry.state,
          save,
        )
      for (const entry of entries) {
        entry.state.status = existing.has(entry.batch.index) ? 'complete' : 'ingesting'
        if (!existing.has(entry.batch.index)) entry.state.usagePending = true
      }
      await save()
      if (!pending.length) return
      const startedAt = Date.now()
      try {
        const response = await (options.fetch ?? fetch)(
          `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${databaseId}/query`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              batch: [
                { sql: RECEIPT_SCHEMA_SQL, params: [] },
                ...pending.flatMap(entry => [
                  ...entry.statements,
                  { sql: receiptSql(plan, entry.batch), params: [] },
                ]),
              ],
            }),
            signal: AbortSignal.timeout(30_000),
          },
        )
        const body = (await response.json()) as {
          success?: boolean
          result?: Array<{ success?: boolean; meta?: unknown }>
        }
        if (
          !response.ok ||
          body.success !== true ||
          !body.result?.length ||
          body.result.some(result => !result.success)
        )
          throw new Error(
            `Bound SQL delivery failed (${response.status}); retain the plan for receipt verification.`,
          )
        let resultOffset = 1
        for (const [index, entry] of pending.entries()) {
          if (index === 0)
            addD1RowUsage(entry.state, readD1RowUsage(body.result[0]?.meta))
          for (let i = 0; i < entry.statements.length + 1; i++)
            addD1RowUsage(
              entry.state,
              readD1RowUsage(body.result[resultOffset++]?.meta),
            )
          entry.state.usagePending = false
        }
        await save()
        const confirmed = await this.confirmedReceipts(
          plan,
          pending.map(entry => entry.batch),
        )
        if (pending.some(entry => !confirmed.has(entry.batch.index)))
          throw new Error('Bound SQL delivery completed without every receipt.')
        for (const entry of pending) entry.state.status = 'complete'
      } finally {
        pending[0]!.state.executionMs += Date.now() - startedAt
        await save()
      }
    },
    /** Positive receipts are scoped to this locked recovery invocation, never persisted as a cache. */
    async confirmedReceipts(plan: SqlDeliveryPlan, batches: SqlDeliveryBatch[]) {
      const confirmed = new Set<number>()
      const groups = new Map<string, SqlDeliveryBatch[]>()
      for (const batch of batches) {
        const group = groups.get(batch.target.databaseId) ?? []
        group.push(batch)
        groups.set(batch.target.databaseId, group)
      }
      for (const [databaseId, group] of groups) {
        const client = query(databaseId)
        const table = await client.query(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${RECEIPT_TABLE}';`,
        )
        if (!table.length) continue
        tables.add(databaseId)
        // Only validated manifest indices and SHA-256 IDs are interpolated; no dynamic bindings.
        // Bound the SQL text and response size even for very large plans.
        for (let offset = 0; offset < group.length; offset += 99) {
          const chunk = group.slice(offset, offset + 99)
          const rows = await client.query(
            `SELECT batchIndex,sha256 FROM ${RECEIPT_TABLE} WHERE planId = '${plan.id}' AND batchIndex IN (${chunk.map(batch => batch.index).join(',')});`,
          )
          for (const batch of chunk) {
            if (
              checkReceipt(
                rows.filter(row => row.batchIndex === batch.index),
                batch,
              )
            )
              confirmed.add(batch.index)
          }
        }
      }
      return confirmed
    },
    async deliver(
      plan: SqlDeliveryPlan,
      batch: SqlDeliveryBatch,
      bytes: Uint8Array,
      state: SqlDeliveryCheckpoint,
      save: () => Promise<void>,
    ) {
      if (await hasReceipt(plan, batch)) {
        state.status = 'complete'
        await save()
        return
      }
      if (state.status === 'complete')
        throw new Error(
          `Remote receipt disappeared for batch ${batch.index}; refusing to repeat its writes.`,
        )
      if (batch.kind === 'bound') {
        if (state.status !== 'pending')
          throw new Error(
            `Bound batch ${batch.index} has an uncertain outcome without a receipt; no writes were repeated.`,
          )
        const statements = JSON.parse(new TextDecoder().decode(bytes)) as Array<{
          sql: string
          params: unknown[]
        }>
        if (state.usagePending) addD1RowUsage(state, readD1RowUsage(undefined))
        await prepareSourceRetirement(plan, batch, statements, state, save)
        state.status = 'ingesting'
        state.usagePending = true
        await save()
        const startedAt = Date.now()
        try {
          const response = await (options.fetch ?? fetch)(
            `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${batch.target.databaseId}/query`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${options.apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                batch: [
                  { sql: RECEIPT_SCHEMA_SQL, params: [] },
                  ...statements,
                  { sql: receiptSql(plan, batch), params: [] },
                ],
              }),
              signal: AbortSignal.timeout(30_000),
            },
          )
          const body = (await response.json()) as {
            success?: boolean
            result?: Array<{ success?: boolean; meta?: unknown }>
          }
          if (
            !response.ok ||
            body.success !== true ||
            !body.result?.length ||
            body.result.some(result => !result.success)
          )
            throw new Error(
              `Bound SQL delivery failed (${response.status}); retain the plan for receipt verification.`,
            )
          for (let i = 0; i < statements.length + 2; i++)
            addD1RowUsage(state, readD1RowUsage(body.result[i]?.meta))
          state.usagePending = false
          await save()
          if (!(await hasReceipt(plan, batch)))
            throw new Error('Bound SQL delivery completed without its receipt.')
          state.status = 'complete'
        } finally {
          state.executionMs += Date.now() - startedAt
          await save()
        }
        return
      }
      const client = createD1ImportClient({
        ...options,
        databaseId: batch.target.databaseId,
      })
      const sql = `${RECEIPT_SCHEMA_SQL}\n${new TextDecoder().decode(bytes)}\n${receiptSql(plan, batch)}\n`
      const etag = createHash('md5').update(sql).digest('hex')
      const interval = options.pollIntervalMs ?? 1000
      let result: D1ImportPollResult | undefined
      if (state.status === 'pending') {
        const startedAt = Date.now()
        let init = await client.init(etag)
        for (
          let attempt = 0;
          !init.uploadUrl &&
          !init.atBookmark &&
          !init.success &&
          /long-running import/i.test(init.error ?? '');
          attempt++
        ) {
          if (attempt >= 300)
            throw new Error('D1 remains busy; resume this SQL delivery later.')
          await Bun.sleep(interval)
          init = await client.init(etag)
        }
        if (init.uploadUrl && init.filename) {
          const uploadedEtag = await client.upload(init.uploadUrl, sql)
          if (uploadedEtag !== etag)
            throw new Error('SQL delivery upload ETag mismatch.')
          state.filename = init.filename
          state.status = 'uploaded'
        } else if (init.atBookmark || init.status === 'complete' || init.success) {
          state.bookmark = init.atBookmark
          state.status = 'polling'
          result = { ...init, success: init.success ?? false }
        } else
          throw new Error(
            `D1 import initialisation failed: ${init.error ?? init.status ?? 'missing upload target'}`,
          )
        state.uploadMs += Date.now() - startedAt
        await save()
      }
      const startedAt = Date.now()
      try {
        if (state.status === 'uploaded') {
          if (!state.filename)
            throw new Error('SQL delivery upload filename is missing.')
          // Persist intent before sending the non-repeatable request.
          state.status = 'ingesting'
          state.usagePending = true
          await save()
          result = await client.ingest(state.filename, etag)
          state.bookmark = result.atBookmark
          state.status = 'polling'
          await save()
        } else if (
          (state.status === 'ingesting' || state.status === 'polling') &&
          !state.bookmark
        ) {
          // init is a lookup by the exact upload ETag. Never upload or ingest again here.
          const init = await client.init(etag)
          if (
            !init.uploadUrl &&
            !init.filename &&
            (init.atBookmark ||
              init.status === 'complete' ||
              /D1_RESET_DO/.test(init.error ?? ''))
          ) {
            result = { ...init, success: init.success ?? false }
            state.bookmark = init.atBookmark
            state.status = 'polling'
            await save()
          } else {
            if (await hasReceipt(plan, batch)) {
              state.status = 'complete'
              return
            }
            throw new Error(
              `Batch ${batch.index} has an uncertain remote outcome and no receipt/bookmark. No SQL was replayed; retain this delivery for verification.`,
            )
          }
        }
        let recoveryLookups = 0
        for (let attempt = 0; ; attempt++) {
          const terminal =
            result?.status === 'complete' || (result?.success && !result.status)
          const interrupted =
            result?.error === 'Not currently importing anything.' ||
            /D1_RESET_DO|Cancelled due to no poll\(\)/.test(result?.error ?? '')
          if (terminal || interrupted) {
            if (terminal && !state.rowUsage) {
              addD1RowUsage(state, readD1RowUsage(result?.result?.meta))
              state.usagePending = false
              await save()
            }
            if (await hasReceipt(plan, batch)) break
            // A stale bookmark can outlive the import worker. Reattach by the
            // exact payload ETag, never by re-uploading or re-ingesting SQL.
            // Keep polling the returned bookmark: D1 cancels idle imports.
            if (recoveryLookups++ >= 3)
              throw new Error(
                `D1 reported completion without the expected receipt for batch ${batch.index}; exact-content recovery exhausted. ${result?.error ?? ''}`,
              )
            await Bun.sleep(interval * 2 ** (recoveryLookups - 1))
            const recovered = await client.init(etag)
            if (recovered.uploadUrl || recovered.filename)
              throw new Error(
                `D1 reported completion without the expected receipt for batch ${batch.index}; refusing to upload or ingest again.`,
              )
            result = { ...recovered, success: recovered.success ?? false }
            state.bookmark = recovered.atBookmark?.trim() || state.bookmark
            await save()
            if (recovered.atBookmark || /D1_RESET_DO/.test(recovered.error ?? ''))
              continue
            throw new Error(
              `D1 reported completion without the expected receipt for batch ${batch.index}; recovery returned no active bookmark. ${recovered.error ?? ''}`,
            )
          }
          if (result?.error && !/long-running import/i.test(result.error)) {
            throw new Error(
              `D1 SQL delivery failed; no automatic replay: ${result.error}`,
            )
          }
          if (attempt >= 3600 || !state.bookmark) {
            if (await hasReceipt(plan, batch)) break
            throw new Error(
              `Batch ${batch.index} has no confirmed outcome. Resume polling or verify its receipt; no automatic replay.`,
            )
          }
          await Bun.sleep(interval)
          result = await client.poll(state.bookmark)
          state.bookmark = result.atBookmark?.trim() || state.bookmark
          await save()
        }
        if (!(await hasReceipt(plan, batch)))
          throw new Error(
            `D1 reported completion without the expected receipt for batch ${batch.index}; refusing to replay or advance.`,
          )
        state.status = 'complete'
      } finally {
        state.executionMs += Date.now() - startedAt
        await save()
      }
    },
  }
}
