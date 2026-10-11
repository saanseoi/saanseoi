import { createHash } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { OVERTURIST_ROOT, REPO_ROOT } from './sourceUpdatesConfig'

export const OVERTURE_PRC_COUNTRY_ID = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be'
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
type Query = (sql: string) => Promise<Array<Record<string, unknown>>>

/** Use the extraction tool's DuckDB runtime without changing its installation. */
async function query(sql: string) {
  const module = pathToFileURL(resolve(OVERTURIST_ROOT, 'libs/data/db.ts')).href
  const child = Bun.spawn(
    [
      process.execPath,
      '--eval',
      `const { runDuckDBQuery } = await import(${JSON.stringify(module)});
     const result = await runDuckDBQuery(${JSON.stringify(sql)}, { silent: true });
     if (result.exitCode) { console.error(result.stderr); process.exit(1); }
     console.log(result.stdout);`,
    ],
    { cwd: OVERTURIST_ROOT, stdout: 'pipe', stderr: 'pipe' },
  )
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (status) throw Error(`Overture country preparation failed: ${stderr.trim()}`)
  return JSON.parse(stdout) as Array<Record<string, unknown>>
}

export type CountryPreparationReference = {
  kind: 'cached-publisher-metadata' | 'reviewed-hierarchy-reference'
  sha256: string
  document: Record<string, unknown>
}

/** Retain raw extraction bytes; close ancestry with an explicitly audited reference. */
export async function prepareOvertureCountryAnchor(
  input: string,
  version: string,
  execute: Query = query,
  cacheRoot = resolve(OVERTURIST_ROOT, '.cache'),
): Promise<{ filePath: string; reference?: CountryPreparationReference }> {
  if (!/^20\d{2}-\d{2}-\d{2}\.\d+$/.test(version))
    throw Error('Country preparation requires an exact Overture release version.')
  const countSql = `SELECT count(*)::INTEGER AS count FROM read_parquet(${literal(input)}) WHERE id = ${literal(OVERTURE_PRC_COUNTRY_ID)}`
  const count = Number((await execute(countSql))[0]?.count)
  if (count === 1) return { filePath: input }
  if (count !== 0) throw Error('Invalid or duplicate Overture country anchor.')

  const cached = Bun.file(
    resolve(cacheRoot, version, 'division', `${OVERTURE_PRC_COUNTRY_ID}.json`),
  )
  const cacheHit = await cached.exists()
  const source = cacheHit
    ? cached
    : Bun.file(
        resolve(REPO_ROOT, 'fixtures/divisions/overture/hk-prc-country-anchor.json'),
      )
  const bytes = await source.text()
  const document = JSON.parse(bytes) as Record<string, unknown>
  if (
    document.id !== OVERTURE_PRC_COUNTRY_ID ||
    document.subtype !== 'country' ||
    (cacheHit
      ? document.country !== 'CN'
      : (document.fixture as { reviewStatus?: string })?.reviewStatus !== 'reviewed')
  )
    throw Error('Invalid Overture country reference.')
  const reference: CountryPreparationReference = {
    kind: cacheHit ? 'cached-publisher-metadata' : 'reviewed-hierarchy-reference',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    document,
  }
  const names = document.names as {
    primary?: string
    common?: Array<{ key?: string; language?: string; value: string }>
  }
  if (!names?.primary || !Array.isArray(names.common))
    throw Error('Invalid Overture country reference names.')
  // Both inputs are reference metadata. Do not invent publisher geometry or source fields.
  const row = {
    id: OVERTURE_PRC_COUNTRY_ID,
    subtype: 'country',
    country: 'CN',
    theme: 'divisions',
    type: 'division',
    names: {
      primary: names.primary,
      common: names.common.map(item => ({
        key: item.key ?? item.language,
        value: item.value,
      })),
    },
  }
  const inputHash = createHash('sha256')
    .update(new Uint8Array(await Bun.file(input).arrayBuffer()))
    .digest('hex')
  const preparedHash = createHash('sha256')
    .update(
      JSON.stringify({
        inputHash,
        version,
        referenceHash: reference.sha256,
        format: 1,
      }),
    )
    .digest('hex')
  const directory = resolve(REPO_ROOT, '.local/overture-preparation', version)
  await mkdir(directory, { recursive: true })
  const output = resolve(directory, `${preparedHash}.parquet`)
  if (await Bun.file(output).exists()) return { filePath: output, reference }
  const temporary = `${output}.${crypto.randomUUID()}.tmp`
  const jsonPath = `${temporary}.json`
  try {
    await Bun.write(jsonPath, JSON.stringify([row]))
    await execute(`
      CREATE TEMP TABLE anchor AS SELECT * FROM read_parquet(${literal(input)}) LIMIT 0;
      INSERT INTO anchor BY NAME SELECT * REPLACE (struct_pack("primary" := names.primary, common := map_from_entries(names.common)) AS names) FROM read_json_auto(${literal(jsonPath)});
      SELECT CASE WHEN count(*) = 1 AND bool_and(subtype = 'country' AND country = 'CN') THEN true ELSE error('Invalid Overture country reference') END FROM anchor;
      COPY (SELECT * FROM read_parquet(${literal(input)}) UNION ALL BY NAME SELECT * FROM anchor) TO ${literal(temporary)} (FORMAT PARQUET, COMPRESSION 'ZSTD');
    `)
    await rename(temporary, output)
    return { filePath: output, reference }
  } finally {
    await rm(temporary, { force: true })
    await rm(jsonPath, { force: true })
  }
}
