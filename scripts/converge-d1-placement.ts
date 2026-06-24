#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type Environment = 'preview' | 'production'
type BindingName =
  | 'DB_META'
  | 'DB_CURRENT'
  | 'DB_HISTORY_HK_2025'
  | 'DB_HISTORY_HK_2026'
  | 'DB_SOURCE_HK_2025'
  | 'DB_SOURCE_HK_2026'

type Options = {
  environments: Environment[]
  iterations: number
  location: string
  maxCycles: number
  requireColo: string | null
  thresholdP50Ms: number
  thresholdP95Ms: number
  whitelistFile: string
}

type ProbeResponse = {
  bindings: Array<{
    binding: BindingName
    stats: {
      p50Ms: number
      p95Ms: number
    }
  }>
  request: {
    colo: string | null
    host: string
  }
  worker: string
}

type BindingAssessment = {
  binding: BindingName
  colos: string[]
  failedReasons: string[]
  locked: boolean
  pass: boolean
  worstP50Ms: number
  worstP95Ms: number
}

type PlacementWhitelist = Partial<Record<`${Environment}:${BindingName}`, true>>

const allBindings: BindingName[] = [
  'DB_META',
  'DB_CURRENT',
  'DB_HISTORY_HK_2025',
  'DB_HISTORY_HK_2026',
  'DB_SOURCE_HK_2025',
  'DB_SOURCE_HK_2026',
]

const probeUrls: Record<Environment, string[]> = {
  preview: [
    'https://preview.saanseoi.hk/api/v0/meta/d1-placement-probe',
    'https://preview.harbour.saanseoi.hk/api/v1/meta/d1-placement-probe',
  ],
  production: [
    'https://saanseoi.hk/api/v0/meta/d1-placement-probe',
    'https://harbour.saanseoi.hk/api/v1/meta/d1-placement-probe',
  ],
}

const options = parseArgs(Bun.argv.slice(2))
const whitelist = loadWhitelist(options.whitelistFile)

console.log(
  [
    'Starting D1 placement convergence.',
    `environments=${options.environments.join(',')}`,
    `location=${options.location}`,
    `max_cycles=${options.maxCycles}`,
    `iterations=${options.iterations}`,
    `threshold_p50_ms=${options.thresholdP50Ms}`,
    `threshold_p95_ms=${options.thresholdP95Ms}`,
    `whitelist_file=${options.whitelistFile}`,
    options.requireColo ? `require_colo=${options.requireColo}` : null,
  ]
    .filter(Boolean)
    .join(' '),
)

for (let cycle = 1; cycle <= options.maxCycles; cycle += 1) {
  console.log(`\n=== Cycle ${cycle}/${options.maxCycles} ===`)

  let allPassed = true

  for (const environment of options.environments) {
    const assessments = await assessEnvironment(environment, options, whitelist)
    const failedBindings = assessments.filter(
      assessment => !assessment.pass && !assessment.locked,
    )

    printEnvironmentSummary(environment, assessments)

    let whitelistChanged = false

    for (const assessment of assessments) {
      if (!assessment.locked && assessment.failedReasons.length === 0) {
        whitelist[whitelistKey(environment, assessment.binding)] = true
        whitelistChanged = true
      }
    }

    if (whitelistChanged) {
      saveWhitelist(options.whitelistFile, whitelist)
    }

    if (failedBindings.length === 0) {
      continue
    }

    allPassed = false

    for (const assessment of failedBindings) {
      recreateBinding(environment, assessment.binding, options)
    }

    deployEnvironment(environment)
  }

  if (allPassed) {
    console.log('\nAll requested bindings satisfy the placement criteria.')
    process.exit(0)
  }
}

console.error('\nPlacement convergence did not finish before maxCycles was reached.')
process.exit(1)

function parseArgs(args: string[]): Options {
  const defaults: Options = {
    environments: ['preview', 'production'],
    iterations: 20,
    location: 'apac',
    maxCycles: 20,
    requireColo: null,
    thresholdP50Ms: 15,
    thresholdP95Ms: 50,
    whitelistFile: resolve(import.meta.dir, '..', '.local/d1-placement-whitelist.json'),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    switch (arg) {
      case '--env':
      case '--environment': {
        const value = expectValue(args, ++index, '--environment')
        defaults.environments =
          value === 'all' ? ['preview', 'production'] : [value as Environment]
        break
      }
      case '--location':
        defaults.location = expectValue(args, ++index, '--location')
        break
      case '--iterations':
        defaults.iterations = Number(expectValue(args, ++index, '--iterations'))
        break
      case '--max-cycles':
        defaults.maxCycles = Number(expectValue(args, ++index, '--max-cycles'))
        break
      case '--threshold-p50-ms':
        defaults.thresholdP50Ms = Number(
          expectValue(args, ++index, '--threshold-p50-ms'),
        )
        break
      case '--threshold-p95-ms':
        defaults.thresholdP95Ms = Number(
          expectValue(args, ++index, '--threshold-p95-ms'),
        )
        break
      case '--require-colo':
        defaults.requireColo = expectValue(args, ++index, '--require-colo')
        break
      case '--whitelist-file':
        defaults.whitelistFile = resolve(
          import.meta.dir,
          '..',
          expectValue(args, ++index, '--whitelist-file'),
        )
        break
      case '--help':
        printHelpAndExit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (
    defaults.environments.some(
      environment => environment !== 'preview' && environment !== 'production',
    )
  ) {
    throw new Error(`Unsupported environment list: ${defaults.environments.join(', ')}`)
  }

  if (!Number.isInteger(defaults.iterations) || defaults.iterations < 1) {
    throw new Error('--iterations must be a positive integer.')
  }

  if (!Number.isInteger(defaults.maxCycles) || defaults.maxCycles < 1) {
    throw new Error('--max-cycles must be a positive integer.')
  }

  return defaults
}

function expectValue(args: string[], index: number, flag: string) {
  const value = args[index]

  if (!value) {
    throw new Error(`Missing value for ${flag}`)
  }

  return value
}

function printHelpAndExit(code: number): never {
  console.log(`Usage:
  bun ./scripts/converge-d1-placement.ts [options]

Options:
  --env <preview|production|all>   Defaults to all.
  --location <hint>                Passed to wrangler d1 create. Defaults to apac.
  --iterations <n>                 Probe iterations per endpoint. Defaults to 20.
  --max-cycles <n>                 Maximum recreate/deploy cycles. Defaults to 20.
  --threshold-p50-ms <n>           Pass threshold for the worst p50 across both probes. Defaults to 15.
  --threshold-p95-ms <n>           Pass threshold for the worst p95 across both probes. Defaults to 50.
  --require-colo <colo>            Optional strict colo requirement, e.g. HKG.
  --whitelist-file <path>          Persistent pass-once whitelist file. Defaults to .local/d1-placement-whitelist.json.
`)
  process.exit(code)
}

async function assessEnvironment(
  environment: Environment,
  options: Options,
  whitelist: PlacementWhitelist,
) {
  const probes = await Promise.all(
    probeUrls[environment].map(url => fetchProbe(url, options.iterations)),
  )

  return allBindings.map(binding =>
    assessBinding(binding, probes, options, whitelist, environment),
  )
}

async function fetchProbe(url: string, iterations: number) {
  const response = await fetch(`${url}?iterations=${iterations}`)

  if (!response.ok) {
    throw new Error(
      `Probe request failed for ${url}: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as ProbeResponse
}

function assessBinding(
  binding: BindingName,
  probes: ProbeResponse[],
  options: Options,
  whitelist: PlacementWhitelist,
  environment: Environment,
): BindingAssessment {
  const matchingBindings = probes.map(probe => {
    const match = probe.bindings.find(entry => entry.binding === binding)

    if (!match) {
      throw new Error(
        `Probe response from ${probe.request.host} is missing ${binding}.`,
      )
    }

    return {
      colo: probe.request.colo,
      host: probe.request.host,
      p50Ms: match.stats.p50Ms,
      p95Ms: match.stats.p95Ms,
      worker: probe.worker,
    }
  })

  const worstP50Ms = Math.max(
    ...matchingBindings.map(bindingStats => bindingStats.p50Ms),
  )
  const worstP95Ms = Math.max(
    ...matchingBindings.map(bindingStats => bindingStats.p95Ms),
  )
  const colos = [
    ...new Set(matchingBindings.map(bindingStats => bindingStats.colo ?? 'unknown')),
  ]
  const failedReasons: string[] = []

  if (worstP50Ms > options.thresholdP50Ms) {
    failedReasons.push(`worst_p50=${worstP50Ms}ms`)
  }

  if (worstP95Ms > options.thresholdP95Ms) {
    failedReasons.push(`worst_p95=${worstP95Ms}ms`)
  }

  if (options.requireColo) {
    const wrongColos = matchingBindings.filter(
      bindingStats => bindingStats.colo !== options.requireColo,
    )

    if (wrongColos.length > 0) {
      failedReasons.push(
        `colo=${wrongColos.map(bindingStats => `${bindingStats.host}:${bindingStats.colo ?? 'unknown'}`).join(',')}`,
      )
    }
  }

  const locked = Boolean(whitelist[whitelistKey(environment, binding)])

  return {
    binding,
    colos,
    failedReasons: locked ? [] : failedReasons,
    locked,
    pass: locked || failedReasons.length === 0,
    worstP50Ms,
    worstP95Ms,
  }
}

function printEnvironmentSummary(
  environment: Environment,
  assessments: BindingAssessment[],
) {
  console.log(`\n${environment.toUpperCase()}`)

  for (const assessment of assessments) {
    console.log(
      [
        assessment.locked ? 'LOCKED' : assessment.pass ? 'PASS' : 'FAIL',
        assessment.binding,
        `p50=${assessment.worstP50Ms}ms`,
        `p95=${assessment.worstP95Ms}ms`,
        `colos=${assessment.colos.join(',')}`,
        assessment.failedReasons.length > 0
          ? `reasons=${assessment.failedReasons.join(';')}`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }
}

function recreateBinding(
  environment: Environment,
  binding: BindingName,
  options: Options,
) {
  const command = [
    'bun',
    'run',
    'd1:recreate',
    '--',
    '--binding',
    binding,
    '--env',
    environment,
    '--location',
    options.location,
  ]

  runCommand(`Recreating ${environment} ${binding}`, command)
}

function deployEnvironment(environment: Environment) {
  runCommand(`Deploying ${environment} workers`, [
    'bun',
    'run',
    `deploy:${environment}`,
  ])
}

function runCommand(label: string, command: string[]) {
  console.log(`${label}: ${command.join(' ')}`)
  execFileSync(command[0]!, command.slice(1), {
    cwd: import.meta.dir + '/..',
    stdio: 'inherit',
  })
}

function whitelistKey(environment: Environment, binding: BindingName) {
  return `${environment}:${binding}` as const
}

function loadWhitelist(path: string) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PlacementWhitelist
  } catch {
    return {}
  }
}

function saveWhitelist(path: string, whitelist: PlacementWhitelist) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(whitelist, null, 2)}\n`)
}
