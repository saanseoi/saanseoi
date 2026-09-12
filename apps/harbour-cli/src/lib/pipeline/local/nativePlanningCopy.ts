import { Database } from 'bun:sqlite'
import { createReadStream, closeSync, openSync, writeSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { prepareNativeSqlDelivery } from './nativeSqlDelivery.ts'

type Append = Parameters<Parameters<typeof prepareNativeSqlDelivery>[0]['generate']>[0]
type PlanningDatabase = ReturnType<typeof drizzle>

/**
 * Run a read-after-write planner on WAL-safe copies, retaining exact generated DML.
 * The caller must hold the cache-wide delivery lock for the entire operation.
 * Only Drizzle operations on the supplied databases are captured; raw clients,
 * transactions, DDL and CTEs are deliberately outside this interface.
 */
export async function captureNativePlanningCopy<T>(input: {
  targets: Record<string, { path: string; schema: Record<string, unknown> }>
  append: Append
  onProgress?: (
    completed: number,
    total: number,
    binding: string,
  ) => void | Promise<void>
  generate: (databases: Record<string, PlanningDatabase>) => Promise<T>
}) {
  const directory = await mkdtemp(join(tmpdir(), 'harbour-native-planning-'))
  const journal = join(directory, 'writes.jsonl')
  const fd = openSync(journal, 'wx', 0o600)
  const clients: Database[] = []
  const databases: Record<string, PlanningDatabase> = {}
  try {
    const targetEntries = Object.entries(input.targets)
    for (const [index, [binding, target]] of targetEntries.entries()) {
      const path = join(directory, `${index}.sqlite`)
      const source = new Database(target.path, { readonly: true, create: false })
      try {
        source.query('VACUUM INTO ?').run(path)
      } finally {
        source.close()
      }
      const client = new Database(path, { readwrite: true, create: false })
      clients.push(client)
      client.exec('PRAGMA foreign_keys = ON')
      databases[binding] = drizzle({
        client,
        schema: target.schema,
        logger: {
          logQuery(query, params) {
            if (
              /^\s*select\b/i.test(query) &&
              !query.includes('saanseoi-publication-guard')
            )
              return
            if (
              !/^\s*(insert|update|delete)\b/i.test(query) &&
              !query.includes('saanseoi-publication-guard')
            )
              throw new Error(
                'Native planning capture accepts generated DML and SELECT only.',
              )
            const line = Buffer.from(
              JSON.stringify({ binding, sql: inlineNativeParameters(query, params) }) +
                '\n',
            )
            // File writes can be short. Never silently truncate a captured mutation.
            for (let offset = 0; offset < line.length; ) {
              const written = writeSync(fd, line, offset, line.length - offset)
              if (!written)
                throw new Error('Unable to record native planning mutation.')
              offset += written
            }
          },
        },
      }) as PlanningDatabase
      await input.onProgress?.(index + 1, targetEntries.length, binding)
    }
    const result = await input.generate(databases)
    // Do not append anything if generation failed. Buffer at most one payload plus
    // one generated statement, preserving order across databases and statements.
    const stream = createReadStream(journal)
    const lines = createInterface({
      input: stream,
      crlfDelay: Infinity,
    })
    let binding: string | undefined
    let parts: string[] = []
    let bytes = 0
    const flush = async () => {
      if (binding && parts.length)
        await input.append(
          { bindingName: binding, databaseId: binding },
          Buffer.from(parts.join('\n')),
        )
      parts = []
      bytes = 0
    }
    const pendingGuards = new Map<string, string[]>()
    try {
      for await (const line of lines) {
        const row = JSON.parse(line) as { binding: string; sql: string }
        if (
          /^\s*select\b/i.test(row.sql) &&
          row.sql.includes('saanseoi-publication-guard')
        ) {
          const guards = pendingGuards.get(row.binding) ?? []
          guards.push(row.sql)
          pendingGuards.set(row.binding, guards)
          continue
        }
        const guards = pendingGuards.get(row.binding)
        if (guards?.length) {
          row.sql = [
            'SELECT 1 /* saanseoi-audit-commit:start */;',
            ...guards,
            row.sql,
            'SELECT 1 /* saanseoi-audit-commit:end */;',
          ].join('\n')
          pendingGuards.delete(row.binding)
        }
        const size = Buffer.byteLength(row.sql) + 1
        if (row.binding !== binding || bytes + size > 4 * 1024 * 1024) await flush()
        binding = row.binding
        parts.push(row.sql)
        bytes += size
      }
      for (const [guardBinding, guards] of pendingGuards) {
        if (binding !== guardBinding) await flush()
        binding = guardBinding
        parts.push(...guards)
        bytes += guards.reduce((sum, guard) => sum + Buffer.byteLength(guard) + 1, 0)
      }
      await flush()
    } finally {
      lines.close()
      stream.destroy()
    }
    return result
  } finally {
    closeSync(fd)
    for (const client of clients) client.close()
    await rm(directory, { recursive: true, force: true })
  }
}

/** Expand anonymous Drizzle placeholders without interpreting quoted SQL text. */
export function inlineNativeParameters(query: string, params: unknown[]) {
  let index = 0
  const sql = query.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\?(?:\d+)?|[:@$][a-zA-Z_][a-zA-Z_0-9]*/g,
    token => {
      if (token[0] !== '?' && !/^[:@$]/.test(token)) return token
      if (token !== '?' || index >= params.length)
        throw new Error('Unsupported native planning SQL placeholder.')
      const value = params[index++]
      if (value === null) return 'NULL'
      if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`
      if (typeof value === 'string')
        return value.includes('\0')
          ? `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
          : `'${value.replaceAll("'", "''")}'`
      if (typeof value === 'bigint') return String(value)
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      if (typeof value === 'boolean') return value ? '1' : '0'
      throw new Error('Unsupported native planning SQL parameter.')
    },
  )
  if (index !== params.length)
    throw new Error('Native planning SQL parameter count differs.')
  return `${sql.replace(/;\s*$/, '')};`
}
