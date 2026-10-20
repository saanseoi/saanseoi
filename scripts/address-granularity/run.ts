import { readDeploymentConfig } from '../address-premises/config'
import { localDatabase, remoteDatabase } from './database'
import { repairGranularities } from './repair'

const [mode, target, flag] = Bun.argv.slice(2)
if (
  !['--local', '--remote'].includes(mode ?? '') ||
  !target ||
  (flag && flag !== '--apply')
)
  throw new Error(
    'Usage: bun scripts/address-granularity/run.ts --local PATH|--remote preview|production [--apply]',
  )
const apply = flag === '--apply'
process.umask(0o077)
if (mode === '--local') {
  const db = localDatabase(target, apply)
  try {
    console.log(JSON.stringify({ rows: await repairGranularities(db.query, apply) }))
  } finally {
    db.close()
  }
} else {
  if (!['preview', 'production'].includes(target))
    throw new Error('Invalid environment')
  const config = await readDeploymentConfig(
    `${import.meta.dir}/../../apps/harbour-api/wrangler.jsonc`,
  )
  const targets = config.env[target].d1_databases.filter(
    (d: { binding: string }) =>
      d.binding === 'DB_CURRENT' ||
      /^DB_HISTORY_[A-Z]{2}_(BEFORE|\d{4})$/.test(d.binding),
  )
  if (
    !targets.some((d: { binding: string }) => d.binding === 'DB_CURRENT') ||
    targets.length < 2
  )
    throw new Error('Incomplete target inventory')
  for (const db of targets) {
    const query = remoteDatabase(
      process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      db.database_id,
      process.env.CLOUDFLARE_D1_TOKEN ?? '',
    )
    console.log(
      JSON.stringify({
        database: db.database_name,
        rows: await repairGranularities(query, apply),
      }),
    )
    if (apply && (await repairGranularities(query, false)))
      throw new Error('Granularity repair incomplete')
  }
}
