import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  formatInitialisationSummary,
  interruptInitialisationProcess,
  resolveInitialisationCommand,
} from './init.ts'
import { parseInitialisationSummaryEvents } from './initialisationSummary.ts'

describe('initialisation commands', () => {
  const repoRoot = resolve(import.meta.dir, '../../../../..')

  test('broadcasts curation bypass to child initialisers but not lifecycle commands', () => {
    const result = Bun.spawnSync({
      cmd: [
        'fish',
        '--no-config',
        '-c',
        `
        source scripts/init/common.fish
        ${readFileSync(resolve(repoRoot, 'scripts/init/common.fish'), 'utf8')
          .match(/function init_run_step\n[\s\S]*?\nend/)?.[0]
          .replace('    $argv\n', "    string join ' ' -- $argv[2..-1]\n")}
        init_configure test --skip-curation-checks
        init_run_step ./bin/saanseoi init:addresses --target local
        init_run_step ./bin/saanseoi init:addresses:saanseoi --target local
        init_run_step ./bin/saanseoi init:addresses:saanseoi:begin --target local
        string join ' ' -- $saanseoi_init_curation_args
        exit 0
      `,
      ],
      cwd: repoRoot,
    })
    expect(result.stderr.toString()).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim().split('\n')).toEqual([
      'init:addresses --target local --skip-curation-checks',
      'init:addresses:saanseoi --target local --skip-curation-checks',
      'init:addresses:saanseoi:begin --target local',
      '--skip-curation-checks',
    ])
  })

  test('maps each supported family and domain to a dedicated script', () => {
    expect(resolveInitialisationCommand('init')).toEqual({
      script: 'scripts/init/all.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:local')).toEqual({
      script: 'scripts/init/local.fish',
      supportsContinue: false,
      supportsTarget: false,
    })
    expect(resolveInitialisationCommand('init:production')).toEqual({
      script: 'scripts/init/production.fish',
      supportsContinue: false,
      supportsTarget: false,
    })
    expect(resolveInitialisationCommand('init:divisions')).toEqual({
      script: 'scripts/init/divisions.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:addresses')).toEqual({
      script: 'scripts/init/addresses.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:places')).toEqual({
      script: 'scripts/init/places.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:stats')).toEqual({
      script: 'scripts/init/stats.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:streets')).toEqual({
      script: 'scripts/init/streets.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:geographic')).toEqual({
      script: 'scripts/init/divisions-overture.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-pu')).toEqual({
      script: 'scripts/init/divisions-hkgov-pland-pu.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-landsd')).toEqual({
      script: 'scripts/init/divisions-hkgov-landsd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-pland-new-town')).toEqual(
      {
        script: 'scripts/init/divisions-hkgov-pland-new-town.fish',
        supportsContinue: true,
        supportsTarget: true,
      },
    )
    expect(resolveInitialisationCommand('init:streets:saanseoi')).toEqual({
      script: 'scripts/init/streets-hkgov-landsd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:addresses:saanseoi')).toEqual({
      script: 'scripts/init/addresses-hkgov-dpo.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:stats:government')).toEqual({
      script: 'scripts/init/stats-hkgov-censtatd.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:places:overture')).toEqual({
      script: 'scripts/init/places-overture.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
    expect(resolveInitialisationCommand('init:divisions:hkgov-censtatd-hma')).toEqual({
      script: 'scripts/init/divisions-hkgov-censtatd-hma.fish',
      supportsContinue: true,
      supportsTarget: true,
    })
  })

  test('runs the top-level API families in dependency order', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/init/all.fish'), 'utf8')
    const order = ['init:divisions', 'init:stats', 'init:addresses', 'init:places']
    const positions = order.map(command => source.indexOf(`    ${command}`))

    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
  })

  test('hands completed Geographic Divisions to Statistics in combined initialisers', () => {
    for (const script of ['all.fish', 'local.fish', 'production.fish']) {
      const result = Bun.spawnSync({
        cmd: [
          'fish',
          '--no-config',
          '-c',
          `
          source scripts/init/common.fish
          function init_clear_clean_run_manifests
          end
          function init_run_step
            printf '%s|%s\\n' $argv[2] "$SAANSEOI_INIT_COMPLETED_PREREQUISITES"
          end
          ${readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8').slice(
            readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8').indexOf(
              'init_configure',
            ),
          )}
        `,
        ],
        cwd: repoRoot,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stderr.toString()).toBe('')
      const statsLine = result.stdout
        .toString()
        .trim()
        .split('\n')
        .find(line => line.startsWith('init:stats|'))
      expect(statsLine).toBe('init:stats|divisions:geographic')
    }
  })

  test('initialises Geographic Divisions for standalone Statistics only', () => {
    const script = readFileSync(
      resolve(repoRoot, 'scripts/init/stats-hkgov-censtatd.fish'),
      'utf8',
    )
    const run = (completedPrerequisites?: string) =>
      Bun.spawnSync({
        cmd: [
          'fish',
          '--no-config',
          '-c',
          `
          source scripts/init/common.fish
          function init_run_step
            echo $argv[2]
          end
          ${completedPrerequisites ? `set -gx SAANSEOI_INIT_COMPLETED_PREREQUISITES ${completedPrerequisites}` : ''}
          ${script.slice(script.indexOf('init_configure'))}
        `,
        ],
        cwd: repoRoot,
      })

    const standalone = run()
    expect(standalone.exitCode).toBe(0)
    expect(standalone.stdout.toString()).toContain('init:divisions:geographic')

    const combined = run('divisions:geographic')
    expect(combined.exitCode).toBe(0)
    expect(combined.stdout.toString()).not.toContain('init:divisions:geographic')
    expect(combined.stdout.toString()).toContain('update')
  })

  test('does not resolve an unsupported family and domain', () => {
    expect(resolveInitialisationCommand('init:divisions:unknown')).toBeUndefined()
  })

  test('stops umbrella initialisation at the first failed dependency', () => {
    for (const script of [
      'all.fish',
      'local.fish',
      'production.fish',
      'divisions.fish',
    ]) {
      const source = readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8')

      expect(source).toContain('init_run_step ./bin/saanseoi $command')
      expect(source).not.toContain('or set failed 1')
    }
  })

  test('uses current public domains and includes the HMA domain in Divisions', () => {
    for (const script of ['divisions.fish']) {
      const source = readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8')
      expect(source).toContain('init:divisions:hkgov-censtatd-hma')
    }

    for (const script of ['all.fish', 'local.fish', 'production.fish']) {
      const source = readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8')
      expect(source).toContain('init:divisions')
      expect(source).toContain('init:addresses')
      expect(source).toContain('init:places')
      expect(source).toContain('init:stats')
    }

    expect(
      readFileSync(resolve(repoRoot, 'scripts/init/addresses-hkgov-dpo.fish'), 'utf8'),
    ).toContain('--cohort-key 2024-07-25.0')
    expect(
      readFileSync(resolve(repoRoot, 'scripts/init/stats-hkgov-censtatd.fish'), 'utf8'),
    ).toContain('--include-geography')
  })

  test('orchestrates every domain through each API-family shorthand', () => {
    const domainsByFamily = {
      addresses: ['init:addresses:saanseoi'],
      places: ['init:places:overture'],
      stats: ['init:stats:government'],
      streets: ['init:streets:saanseoi'],
    }

    for (const [family, domains] of Object.entries(domainsByFamily)) {
      const source = readFileSync(
        resolve(repoRoot, 'scripts/init', `${family}.fish`),
        'utf8',
      )
      for (const domain of domains) expect(source).toContain(domain)
      expect(source).toContain('init_run_step ./bin/saanseoi $command')
    }
  })

  test('skips an already-complete official address initialisation before any work', () => {
    const source = readFileSync(
      resolve(repoRoot, 'scripts/init/addresses-hkgov-dpo.fish'),
      'utf8',
    )

    const statusCheck = source.indexOf('init:addresses:saanseoi:status')
    const begin = source.indexOf('init:addresses:saanseoi:begin')
    const ingest = source.indexOf('hkgov-dpo:ingest')
    expect(statusCheck).toBeGreaterThan(-1)
    expect(statusCheck).toBeLessThan(begin)
    expect(begin).toBeLessThan(ingest)
    expect(source.slice(statusCheck, begin)).toContain('exit 0')
  })

  test('skips an already-complete Overture Places initialisation before any work', () => {
    const source = readFileSync(
      resolve(repoRoot, 'scripts/init/places-overture.fish'),
      'utf8',
    )

    const statusCheck = source.indexOf('init:places:overture:status')
    const begin = source.indexOf('init:places:overture:begin')
    const ingest = source.indexOf('init_run_upload')
    expect(statusCheck).toBeGreaterThan(-1)
    expect(statusCheck).toBeLessThan(begin)
    expect(begin).toBeLessThan(ingest)
    expect(source.slice(statusCheck, begin)).toContain('exit 0')
  })

  test('defers family docs and publishes them once at the end of aggregate init', () => {
    for (const scriptName of ['all.fish', 'local.fish', 'production.fish']) {
      const script = readFileSync(resolve(repoRoot, 'scripts/init', scriptName), 'utf8')
      const result = Bun.spawnSync({
        cmd: [
          'fish',
          '--no-config',
          '-c',
          `
          source scripts/init/common.fish
          function init_clear_clean_run_manifests
          end
          function init_run_step
            printf '%s|%s\\n' $argv[2] "$SAANSEOI_INIT_DEFER_DOCS"
          end
          ${script.slice(script.indexOf('init_configure'))}
        `,
        ],
        cwd: repoRoot,
      })

      expect(result.exitCode).toBe(0)
      expect(result.stderr.toString()).toBe('')
      const lines = result.stdout.toString().trim().split('\n')
      expect(lines.filter(line => line.startsWith('docs:publish|'))).toEqual([
        'docs:publish|',
      ])
      expect(
        lines
          .filter(line => line.startsWith('init:'))
          .every(line => line.endsWith('|1')),
      ).toBe(true)
      expect(lines.at(-1)).toBe('docs:publish|')
    }
  })

  test('retains artefact caches by default and forwards the explicit opt-out', () => {
    const common = readFileSync(resolve(repoRoot, 'scripts/init/common.fish'), 'utf8')
    expect(common).toContain('set -g saanseoi_init_cache_artefacts 1')
    expect(common).toContain('case --no-cache-artefacts')
    expect(common).toContain('set cache_artefact_args --cacheArtefacts')

    for (const script of [
      'all.fish',
      'local.fish',
      'production.fish',
      'divisions.fish',
    ]) {
      const source = readFileSync(resolve(repoRoot, 'scripts/init', script), 'utf8')
      expect(source).toContain('set cache_artefact_opt_out_args --no-cache-artefacts')
    }
  })

  test('normal init skips completed releases before opening input files or the uploader', () => {
    const result = Bun.spawnSync({
      cmd: [
        'fish',
        '--no-config',
        '-c',
        `
        source scripts/init/common.fish
        set -g lookup_count 0
        function init_load_completed_release_codes
          set -g lookup_count (math $lookup_count + 1)
          set -g saanseoi_init_completed_release_codes dr-test-published dr-test-superseded
        end
        init_configure "test init" --target local
        set -gx SAANSEOI_INIT_GUIDES 0,4
        init_run_upload dr-test-published /nonexistent-input.parquet; or exit 1
        init_run_upload dr-test-superseded /nonexistent-input.parquet; or exit 1
        test "$lookup_count" -eq 1; or exit 2
        test "$saanseoi_init_last_upload_processed" -eq 0; or exit 3
        test "$saanseoi_init_upload_failures" -eq 0; or exit 4
        init_is_completed_release dr-test-incomplete; and exit 5
        exit 0
      `,
      ],
      cwd: repoRoot,
    })
    expect(result.exitCode).toBe(0)
    const output = result.stdout.toString()
    expect(output).toContain('dr-test-published   SKIPPED:')
    expect(output).toContain('dr-test-superseded  SKIPPED:')
    const rows = output.trimEnd().split('\n')
    expect(rows[0]?.indexOf('SKIPPED:')).toBe(rows[1]?.indexOf('SKIPPED:'))
    expect(output).not.toContain('UPLOAD PLAN')
    expect(result.stderr.toString()).toBe('')
  })

  test('completed Permanent Living Quarters skips dataops and archive preparation without continue', () => {
    const script = readFileSync(
      resolve(repoRoot, 'scripts/init/divisions-overture.fish'),
      'utf8',
    )
    const block = script.slice(
      script.indexOf('set -l censtatd_area_release_code'),
      script.indexOf('# A resumed initialiser'),
    )
    expect(block).toContain('init_skip_completed_release')
    const result = Bun.spawnSync({
      cmd: [
        'fish',
        '--no-config',
        '-c',
        `
        source scripts/init/common.fish
        function init_load_completed_release_codes
          for resource_type in divisionStatistic division divisionArea
            set -ga saanseoi_init_completed_release_codes "dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2::$resource_type"
          end
        end
        function init_run_step
          echo "Unexpected preparation or upload" >&2
          exit 99
        end
        init_configure "test init" --target local
        set -gx SAANSEOI_INIT_GUIDES 0,4
        ${block}
        test "$saanseoi_init_docs_pending" -eq 0; or exit 2
      `,
      ],
      cwd: repoRoot,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('SKIPPED: published or superseded')
    expect(result.stdout.toString().trimEnd().split('\n')).toHaveLength(3)
    expect(result.stderr.toString()).toBe('')
  })

  test('Divisions publishes docs once after all domains and standalone publishing still works', () => {
    const script = readFileSync(
      resolve(repoRoot, 'scripts/init/divisions.fish'),
      'utf8',
    )
    const result = Bun.spawnSync({
      cmd: [
        'fish',
        '--no-config',
        '-c',
        `
        source scripts/init/common.fish
        function init_run_step
          if test "$argv[2]" = docs:publish
            echo docs
          else
            echo $argv[2]
            init_publish_docs
          end
        end
        ${script.slice(script.indexOf('init_configure'))}
        init_publish_docs
      `,
      ],
      cwd: repoRoot,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim().split('\n')).toEqual([
      'init:divisions:geographic',
      'init:divisions:hkgov-censtatd-hma',
      'init:divisions:hkgov-pland-pu',
      'init:divisions:hkgov-pland-new-town',
      'init:divisions:hkgov-landsd',
      'docs',
      'docs',
    ])
    expect(result.stderr.toString()).toBe('')
  })

  test('does not finalise Places after a failed cohort upload', () => {
    const source = readFileSync(
      resolve(repoRoot, 'scripts/init/places-overture.fish'),
      'utf8',
    )

    expect(source).toContain('init_run_step init_run_upload')
    expect(source.indexOf('init_complete')).toBeLessThan(
      source.indexOf('init_reconcile_draft_release_sets'),
    )
    expect(source.indexOf('init_complete')).toBeLessThan(
      source.indexOf('init:places:overture:complete'),
    )
  })

  test('interrupts the complete detached initialisation process group', () => {
    const signals: Array<[number, NodeJS.Signals]> = []
    const child = {
      kill() {
        throw new Error('the direct child should not be signalled on POSIX')
      },
      pid: 1234,
    }

    interruptInitialisationProcess(child, 'SIGINT', {
      kill(pid, signal) {
        signals.push([pid, signal])
      },
      platform: 'linux',
    })

    expect(signals).toEqual([[-1234, 'SIGINT']])
  })

  test('uses the direct child signal when a process group is unavailable', () => {
    const signals: NodeJS.Signals[] = []
    const child = {
      kill(signal?: number | NodeJS.Signals) {
        if (typeof signal === 'string') signals.push(signal)
      },
      pid: 1234,
    }

    interruptInitialisationProcess(child, 'SIGTERM', {
      kill() {
        throw new Error('no such process group')
      },
      platform: 'linux',
    })

    expect(signals).toEqual(['SIGTERM'])
  })

  test('summarises new API release sets and failed source-release publication', () => {
    const events = parseInitialisationSummaryEvents(
      [
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
        JSON.stringify({
          command: 'init:divisions:geographic',
          message: 'Geometry validation failed.',
          releaseCode: 'dr-hk-overture-division-area-2026-08-19.0',
          type: 'error',
        }),
      ].join('\n'),
    )

    expect(
      formatInitialisationSummary(
        new Set(['data-hk-divisions-2026-07-22.0']),
        new Set(['data-hk-divisions-2026-07-22.0', 'data-hk-divisions-2026-08-19.0']),
        events,
      ),
    ).toBe(
      [
        'Published API release sets',
        '  data-hk-divisions-2026-08-19.0',
        '',
        'Initialisation errors',
        '  dr-hk-overture-division-area-2026-08-19.0: Geometry validation failed.',
      ].join('\n'),
    )
  })

  test('deduplicates release sets published during upload and reconciliation', () => {
    const events = parseInitialisationSummaryEvents(
      [
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
        JSON.stringify({
          apiReleaseSetCode: 'data-hk-divisions-2026-08-19.0',
          type: 'published-api-release-set',
        }),
      ].join('\n'),
    )

    expect(formatInitialisationSummary(undefined, undefined, events)).toBe(
      [
        'Published API release sets',
        '  data-hk-divisions-2026-08-19.0',
        '',
        'Initialisation errors',
        '  -',
      ].join('\n'),
    )
  })

  test('includes Statistics release sets published during bootstrap', () => {
    const events = parseInitialisationSummaryEvents(
      JSON.stringify({
        apiReleaseSetCode: 'data-hk-stats-2023-q3',
        type: 'published-api-release-set',
      }),
    )

    expect(formatInitialisationSummary(undefined, undefined, events)).toBe(
      [
        'Published API release sets',
        '  data-hk-stats-2023-q3',
        '',
        'Initialisation errors',
        '  -',
      ].join('\n'),
    )
  })
})
