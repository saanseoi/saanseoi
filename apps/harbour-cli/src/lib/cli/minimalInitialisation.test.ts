import { afterEach, expect, test } from 'bun:test'
import { selectInitialisationVersions } from './minimalInitialisation.ts'
import { runInitialisationCommand } from '../commands/init.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const previous = process.env.SAANSEOI_INIT_MINIMAL
const repo = resolve(import.meta.dir, '../../../../..')
test('reconciliation does not rebuild unchanged remote dataset mirrors', () => {
  const result = Bun.spawnSync({
    cmd: [
      'fish',
      '--no-config',
      '-c',
      `
      source scripts/init/common.fish
      set -g saanseoi_init_target production
      set -gx SAANSEOI_INIT_SUMMARY_PATH unused-test-path
      function init_published_api_release_set_count; echo 0; end
      function init_run_step; string join ' ' -- $argv; end
      init_reconcile_draft_release_sets ./bin/saanseoi release-sets:reconcile --target production
    `,
    ],
    cwd: repo,
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim()).toBe(
    './bin/saanseoi release-sets:reconcile --target production',
  )
})

test('CLI dispatches minimal initialisation to its explicit-target validation', () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'apps/harbour-cli/src/cli.ts', 'init:minimal'],
    cwd: repo,
  })
  const output = result.stdout.toString() + result.stderr.toString()
  expect(result.exitCode).toBe(1)
  expect(output).toContain('requires an explicit --target')
  expect(output).not.toContain('Unsupported harbour command')
})

afterEach(() => {
  if (previous === undefined) delete process.env.SAANSEOI_INIT_MINIMAL
  else process.env.SAANSEOI_INIT_MINIMAL = previous
})

test('minimal selection retains companion resources and counts completed versions', () => {
  process.env.SAANSEOI_INIT_MINIMAL = '1'
  const releases = [
    { version: '2021', complete: false },
    { version: '2006', complete: false },
    { version: '2001', complete: true },
    { version: '2006', complete: false },
    { version: '2011', complete: false },
  ]
  expect(
    selectInitialisationVersions(releases, r => r.version)
      .filter(r => !r.complete)
      .map(r => r.version),
  ).toEqual(['2006', '2006'])
})

test('full selection preserves all releases and order', () => {
  delete process.env.SAANSEOI_INIT_MINIMAL
  expect(selectInitialisationVersions(['3', '1', '2'], v => v)).toEqual(['3', '1', '2'])
})

test('minimal requires an explicit target and curation checks before spawning', async () => {
  const cases: Record<string, string | boolean>[] = [
    {},
    { target: 'production', 'skip-curation-checks': true },
  ]
  for (const options of cases) {
    await expect(
      runInitialisationCommand(
        {
          command: 'init:minimal',
          positionals: [],
          options,
        },
        () => {},
      ),
    ).rejects.toThrow('requires an explicit --target')
  }
})

test('production minimal coordinator forwards target and resume without resetting', () => {
  const result = Bun.spawnSync({
    cmd: [
      'fish',
      '--no-config',
      '-c',
      `
      function source
        builtin source $argv
        if string match -q '*/common.fish' -- $argv[1]
          function init_run_step
            echo $SAANSEOI_INIT_MINIMAL (string join ' ' -- $argv)
          end
        end
      end
      source scripts/init/minimal.fish --target production --continue
    `,
    ],
    cwd: repo,
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString().trim().split('\n')).toEqual([
    ...['divisions', 'stats', 'addresses', 'places'].map(
      family => `1 ./bin/saanseoi init:${family} --target production --continue`,
    ),
    '1 ./bin/saanseoi docs:publish --target production --scope all',
  ])
})

test('both Overture scripts select the same two cohorts before their upload loops', () => {
  for (const script of ['divisions-overture', 'places-overture']) {
    const source = readFileSync(resolve(repo, `scripts/init/${script}.fish`), 'utf8')
    const selection = source.slice(
      source.indexOf('set -l releases'),
      source.indexOf('for release in $releases'),
    )
    const result = Bun.spawnSync({
      cmd: [
        'fish',
        '--no-config',
        '-c',
        `set -gx SAANSEOI_INIT_MINIMAL 1\n${selection}\nstring join , -- $releases`,
      ],
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toBe('2025-09-24.0,2025-10-22.0')
  }
})
