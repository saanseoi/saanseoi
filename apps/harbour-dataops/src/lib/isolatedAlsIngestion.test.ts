import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ingestAlsReleaseInChild,
  type AlsIngestionRequest,
} from './isolatedAlsIngestion.ts'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('release workers save their result before advancing and inherit ingestion options', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-worker-test-'))
  directories.push(directory)
  const output = join(directory, 'observations.jsonl')
  const worker = join(directory, 'worker.ts')
  await writeFile(
    worker,
    `
    import { appendFile, readFile } from 'node:fs/promises'
    const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
    await new Promise(resolve => setTimeout(resolve, 20))
    await appendFile(input.args.positionals[0], JSON.stringify({ ...input, pid: process.pid }) + '\\n')
  `,
  )
  const input: AlsIngestionRequest = {
    args: {
      command: 'hkgov-dpo:ingest',
      positionals: [output],
      options: { continue: true, 'identity-history': 'history.json' },
    },
    target: { remote: false, environment: 'preview' },
    options: { allowHistoricalCohort: true },
    sourceVersion: '2025-01-23.0',
  }
  await ingestAlsReleaseInChild(input, worker)
  const first = JSON.parse((await readFile(output, 'utf8')).trim())
  expect(first.options).toEqual({
    allowHistoricalCohort: true,
    isolatedSourceVersion: input.sourceVersion,
  })
  expect(first.args.options).toEqual({
    ...input.args.options,
    'defer-api-release-set': true,
  })
  expect(first.target).toEqual(input.target)
  await ingestAlsReleaseInChild({ ...input, sourceVersion: '2025-02-25.0' }, worker)
  const results = (await readFile(output, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(results.map(row => row.sourceVersion)).toEqual([
    '2025-01-23.0',
    '2025-02-25.0',
  ])
  expect(results[0].pid).not.toBe(results[1].pid)
  expect(input.args.options['defer-api-release-set']).toBeUndefined()
})

test('a failed release worker rejects instead of reporting success', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-worker-failure-'))
  directories.push(directory)
  const worker = join(directory, 'worker.ts')
  await writeFile(worker, 'process.exit(17)\n')
  await expect(
    ingestAlsReleaseInChild(
      {
        args: { command: 'hkgov-dpo:ingest', positionals: [], options: {} },
        target: { remote: false, environment: 'preview' },
        options: {},
        sourceVersion: '2025-05-22.0',
      },
      worker,
    ),
  ).rejects.toThrow('ALS ingestion 2025-05-22.0 exited with 17')
})
