#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type Target = 'preview' | 'production'
type BindingName =
  | 'DB_META'
  | 'DB_CURRENT'
  | 'DB_HISTORY_HK_BEFORE'
  | 'DB_HISTORY_HK_2025'
  | 'DB_HISTORY_HK_2026'
  | 'DB_SOURCE_HK_BEFORE'
  | 'DB_SOURCE_HK_2025'
  | 'DB_SOURCE_HK_2026'

type Options = {
  bindings: BindingName[]
  target: Target
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

type PlacementWhitelist = Partial<Record<`${Target}:${BindingName}`, true>>

const allBindings: BindingName[] = [
  'DB_META',
  'DB_CURRENT',
  'DB_HISTORY_HK_BEFORE',
  'DB_HISTORY_HK_2025',
  'DB_HISTORY_HK_2026',
  'DB_SOURCE_HK_BEFORE',
  'DB_SOURCE_HK_2025',
  'DB_SOURCE_HK_2026',
]

const probeUrls: Record<Target, string[]> = {
  preview: [
    'https://preview.api.saanseoi.hk/v0/meta/d1-placement-probe',
    'https://preview.harbour.saanseoi.hk/api/v1/meta/d1-placement-probe',
  ],
  production: [
    'https://api.saanseoi.hk/v0/meta/d1-placement-probe',
    'https://harbour.saanseoi.hk/api/v1/meta/d1-placement-probe',
  ],
}

const repoRoot = resolve(import.meta.dir, '..')
const options = parseArgs(Bun.argv.slice(2))
const environment = options.target
const probeApiKey = resolveRequiredEnvValue('D1_PLACEMENT_PROBE_API_KEY')
const whitelist = loadWhitelist(options.whitelistFile)
const MAX_PROBE_ATTEMPTS = 6
const PROBE_RETRY_DELAY_MS = 10_000

console.log(
  [
    'Starting D1 placement convergence.',
    `environment=${environment}`,
    `location=${options.location}`,
    `max_cycles=${options.maxCycles}`,
    `iterations=${options.iterations}`,
    `bindings=${options.bindings.join(',')}`,
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

  const assessments = await assessEnvironment(
    environment,
    options,
    whitelist,
    probeApiKey,
  )
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
    if (allPassed) {
      console.log('\nAll requested bindings satisfy the placement criteria.')
      process.exit(0)
    }

    continue
  }

  allPassed = false

  for (const assessment of failedBindings) {
    recreateBinding(environment, assessment.binding, options)
  }

  deployEnvironment(environment)
}

console.error('\nPlacement convergence did not finish before maxCycles was reached.')
process.exit(1)

function parseArgs(args: string[]): Options {
  const defaults: Options = {
    bindings: allBindings,
    target: 'preview',
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
      case '--target':
      case '--env':
      case '--environment':
        defaults.target = expectTarget(expectValue(args, ++index, arg), arg)
        break
      case '--location':
        defaults.location = expectValue(args, ++index, '--location')
        break
      case '--bindings':
      case '--binding':
        defaults.bindings = parseBindingList(expectValue(args, ++index, arg), arg)
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

  if (!Number.isInteger(defaults.iterations) || defaults.iterations < 1) {
    throw new Error('--iterations must be a positive integer.')
  }

  if (!Number.isInteger(defaults.maxCycles) || defaults.maxCycles < 1) {
    throw new Error('--max-cycles must be a positive integer.')
  }

  if (!Number.isFinite(defaults.thresholdP50Ms) || defaults.thresholdP50Ms < 0) {
    throw new Error('--threshold-p50-ms must be a non-negative number.')
  }

  if (!Number.isFinite(defaults.thresholdP95Ms) || defaults.thresholdP95Ms < 0) {
    throw new Error('--threshold-p95-ms must be a non-negative number.')
  }

  return defaults
}

function parseBindingList(value: string, flag: string): BindingName[] {
  const bindings = value
    .split(',')
    .map(binding => binding.trim())
    .filter(Boolean)

  if (bindings.length === 0) {
    throw new Error(`${flag} must include at least one binding.`)
  }

  const unknownBindings = bindings.filter(
    (binding): binding is string => !allBindings.includes(binding as BindingName),
  )

  if (unknownBindings.length > 0) {
    throw new Error(
      `${flag} contains unsupported binding(s): ${unknownBindings.join(', ')}. Supported bindings: ${allBindings.join(', ')}.`,
    )
  }

  return [...new Set(bindings)] as BindingName[]
}

function expectTarget(value: string, flag: string): Target {
  if (value === 'preview' || value === 'production') {
    return value
  }

  throw new Error(`${flag} must be preview or production.`)
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
  --target <target>                Target to converge: preview or production. Defaults to preview.
                                   --env and --environment are accepted aliases.
  --location <hint>                Passed to wrangler d1 create. Defaults to apac.
  --bindings <csv>                 Only converge these bindings; omitted means all bindings.
                                   Example: DB_HISTORY_HK_BEFORE,DB_SOURCE_HK_BEFORE.
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
  environment: Target,
  options: Options,
  whitelist: PlacementWhitelist,
  probeApiKey: string,
) {
  const probes = await Promise.all(
    probeUrls[environment].map(url => fetchProbe(url, options.iterations, probeApiKey)),
  )

  return options.bindings.map(binding =>
    assessBinding(binding, probes, options, whitelist, environment),
  )
}

async function fetchProbe(url: string, iterations: number, probeApiKey: string) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt += 1) {
    let response: Response | null = null

    try {
      response = await fetch(`${url}?iterations=${iterations}`, {
        headers: {
          'x-api-key': probeApiKey,
        },
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (response?.ok) {
      return (await response.json()) as ProbeResponse
    }

    if (response) {
      const responseBody = (await response.text()).trim()
      lastError = new Error(
        [
          `Probe request failed for ${url}: ${response.status} ${response.statusText}`,
          responseBody ? `body=${responseBody.slice(0, 500)}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      )

      if (response.status < 500 || response.status > 599) {
        throw lastError
      }
    }

    if (attempt < MAX_PROBE_ATTEMPTS) {
      console.warn(
        `Probe attempt ${attempt}/${MAX_PROBE_ATTEMPTS} failed for ${url}; retrying in ${PROBE_RETRY_DELAY_MS / 1000}s. ${lastError?.message ?? 'unknown error'}`,
      )
      await sleep(PROBE_RETRY_DELAY_MS)
    }
  }

  throw lastError ?? new Error(`Probe request failed for ${url}.`)
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function assessBinding(
  binding: BindingName,
  probes: ProbeResponse[],
  options: Options,
  whitelist: PlacementWhitelist,
  environment: Target,
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
  environment: Target,
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

function recreateBinding(environment: Target, binding: BindingName, options: Options) {
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

function deployEnvironment(environment: Target) {
  runCommand(`Deploying ${environment} workers`, [
    'bun',
    'run',
    `deploy:${environment}`,
  ])
}

function runCommand(label: string, command: string[]) {
  const [file, ...args] = command

  if (!file) {
    throw new Error(`Cannot run ${label}: missing command executable.`)
  }

  console.log(`${label}: ${command.join(' ')}`)
  execFileSync(file, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}

function whitelistKey(environment: Target, binding: BindingName) {
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

function resolveRequiredEnvValue(key: string) {
  const processValue = process.env[key]?.trim()

  if (processValue) {
    return processValue
  }

  const envPaths = [resolve(repoRoot, '.env.local'), resolve(repoRoot, '.env')]

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const match = readFileSync(envPath, 'utf8')
        .split(/\r?\n/u)
        .map(line => line.trim())
        .find(line => line.startsWith(`${key}=`))

      if (match) {
        return match
          .slice(key.length + 1)
          .replace(/^["']|["']$/g, '')
          .trim()
      }
    }
  }

  throw new Error(`Missing ${key}. Export it or define it in ${envPaths.join(' or ')}.`)
}
