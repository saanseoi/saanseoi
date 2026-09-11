import { expect, test } from 'bun:test'
import { fixture } from './sqlDeliveryTestFixture.ts'
import { prepareSqlDelivery, runSqlDelivery } from './sqlDelivery.ts'
import type { D1ImportFetch } from '@repo/core/d1ImportApi'

for (const kind of ['sql', 'bound'] as const)
  test(`${kind} delivery persists row usage once across receipt recovery and local replay`, () =>
    fixture(async f => {
      await prepareSqlDelivery(
        f.directory,
        {
          ...f.context,
          phase: 'address3d-data',
          inputs: { independentBoundTargets: true },
        },
        async append => {
          for (let index = 0; index < 3; index++)
            await append(
              { databaseId: 'db', bindingName: 'DB_CURRENT' },
              new TextEncoder().encode(
                kind === 'sql'
                  ? 'UPDATE counter SET n = n + 1;'
                  : JSON.stringify([
                      { sql: 'UPDATE counter SET n = n + ?', params: [1] },
                    ]),
              ),
              kind,
            )
        },
      )
      const fetch: D1ImportFetch = async (input, init) => {
        const response = await f.options.fetch(input, init)
        if (init?.method === 'PUT') return response
        const body = (await response.json()) as {
          result: { status?: string; result?: unknown } & Array<{ meta?: unknown }>
        }
        const request = JSON.parse(init?.body as string)
        if (request.batch) {
          body.result.forEach(result => {
            result.meta = { rows_read: 2, rows_written: 3 }
          })
        } else if (body.result?.status === 'complete') {
          body.result.result = {
            num_queries: 3,
            meta: { rows_read: 20, rows_written: 30 },
          }
        }
        return Response.json(body)
      }
      const options = { ...f.options, fetch, mode: 'remote' as const }
      const first = await runSqlDelivery(f.directory, options)
      expect(first.rowUsage.complete).toBe(true)
      expect(first.rowUsage.rowsRead).toBe(kind === 'sql' ? 60 : 14)
      expect(first.rowUsage.rowsWritten).toBe(kind === 'sql' ? 90 : 21)
      expect((await runSqlDelivery(f.directory, options)).rowUsage).toEqual(
        first.rowUsage,
      )
      expect(
        (await runSqlDelivery(f.directory, { ...options, mode: 'local' })).rowUsage,
      ).toEqual(first.rowUsage)
      expect(f.localValue()).toEqual({ n: 3 })
    }))

test('lost commit acknowledgement leaves usage unknown without replaying writes', () =>
  fixture(async f => {
    await f.prepare()
    f.fail('after-commit')
    await expect(
      runSqlDelivery(f.directory, { ...f.options, mode: 'remote' }),
    ).rejects.toThrow('connection lost')
    f.fail('none')
    const result = await runSqlDelivery(f.directory, { ...f.options, mode: 'remote' })
    expect(result.rowUsage.complete).toBe(false)
    expect(f.events.filter(event => event === 'ingest')).toHaveLength(3)
    expect(f.remote.query('SELECT n FROM counter').get()).toEqual({ n: 111 })
  }))
