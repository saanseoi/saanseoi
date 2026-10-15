import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { currentSchema, eq, sql } from '@repo/db'
import type { ParsedArgs, UploadTarget } from '../cli/options'
import { resolveCurrentWriteContext } from '../dbCache/currentWriteContext'
import { prepareCurrentGeographicCrosswalks } from '../pipeline/divisions/currentGeographicCrosswalk'
import {
  geographicCrosswalkStatements,
  verifyGeographicCrosswalk,
} from '../pipeline/divisions/geographicCrosswalk'
import { executeSqlText } from '../pipeline/local/sqlImport'

/** Published-release crosswalk delivery, shared by init and one-off backfills. */
export async function runGeographicCrosswalkCommand(
  args: ParsedArgs,
  target: UploadTarget,
) {
  if (
    args.positionals.length ||
    Object.keys(args.options).some(key => key !== 'target')
  )
    throw new Error(
      'Usage: saanseoi divisions:crosswalk --target local|preview|production',
    )
  const context = await resolveCurrentWriteContext(
    target,
    'hk',
    String(new Date().getUTCFullYear()),
  )
  try {
    for await (const prepared of prepareCurrentGeographicCrosswalks(context)) {
      verifyGeographicCrosswalk(prepared.result)
      const { result } = prepared
      const directory = resolve(
        context.state.dbCacheDir,
        'geographic-crosswalks',
        result.id.replace('sha256:', ''),
      )
      await mkdir(directory, { recursive: true })
      await Bun.write(
        resolve(directory, 'crosswalk.json'),
        `${JSON.stringify({ ...result, missingGeographicGeometry: prepared.missingGeographicGeometry }, null, 2)}\n`,
      )
      const payload = `${geographicCrosswalkStatements(result).join('\n')}\n`
      await Bun.write(resolve(directory, 'crosswalk.sql'), payload)
      if (target.remote) {
        const config = JSON.parse(
          await readFile(
            resolve(import.meta.dir, '../../../../harbour-workers/wrangler.jsonc'),
            'utf8',
          ),
        )
        const vars = config.env?.[target.environment]?.vars ?? config.vars
        await executeSqlText(
          {
            name: 'current',
            databaseId: context.state.bindings.DB_CURRENT?.databaseId ?? null,
          },
          payload,
          {
            isLocal: false,
            accountId:
              process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? vars?.CLOUDFLARE_ACCOUNT_ID,
            apiToken: process.env.CLOUDFLARE_D1_TOKEN?.trim(),
          },
        )
      }
      await executeSqlText(
        { name: 'current', databaseId: null, binding: context.currentBinding },
        payload,
        { isLocal: true },
      )
      const table = currentSchema.divisionGeographicMemberships
      const count = await context.currentDb
        .select({ n: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.crosswalkId, result.id))
        .get()
      if (count?.n !== result.memberships.length)
        throw new Error('Crosswalk delivery count mismatch.')
      console.log(
        JSON.stringify(
          {
            id: result.id,
            geographicReleaseSet: result.geographicReleaseSet,
            sourceReleaseSet: result.sourceReleaseSet,
            memberships: count.n,
            missingGeographicGeometry: prepared.missingGeographicGeometry.length,
            directory,
            status: 'complete',
          },
          null,
          2,
        ),
      )
    }
  } finally {
    context.cleanup()
  }
}
