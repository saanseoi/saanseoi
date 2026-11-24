// NODE
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// TOC: Markdown discovery | Formatter adapter | CLI

const installedBiome = resolve(import.meta.dir, '../../node_modules/.bin/biome')

/**
 * List repository Markdown and llms.txt files, including non-ignored additions.
 * @param cwd Repository working directory.
 * @returns Existing file paths, without duplicates.
 */
export function markdownFiles(cwd: string): string[] {
  const result = Bun.spawnSync(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return [...new Set(result.stdout.toString().split('\0'))].filter(
    file =>
      (file.endsWith('.md') || basename(file) === 'llms.txt') &&
      existsSync(join(cwd, file)),
  )
}

/**
 * Format or check Markdown with Biome, supplying a language hint for llms.txt.
 * @param files Paths relative to the working directory.
 * @param cwd Directory containing the applicable Biome configuration.
 * @param write Whether to apply formatting; false only checks the existing bytes.
 * @param env Process environment, cleared of parent Git variables in staged snapshots.
 * @returns Nothing when every file is formatted successfully.
 * @remarks The stdin filename selects Markdown; only an explicit write updates llms.txt.
 */
export function formatMarkdown(
  files: readonly string[],
  cwd: string,
  write = false,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const markdown = files.filter(file => file.endsWith('.md'))
  // Batch ordinary Markdown paths to keep command arguments bounded.
  for (let offset = 0; offset < markdown.length; offset += 100) {
    const result = Bun.spawnSync(
      [
        installedBiome,
        'format',
        ...(write ? ['--write'] : []),
        '--no-errors-on-unmatched',
        ...markdown.slice(offset, offset + 100).map(file => `./${file}`),
      ],
      { cwd, env, stdout: 'pipe', stderr: 'pipe' },
    )
    if (result.exitCode !== 0) throw new Error(`${result.stdout}${result.stderr}`)
  }

  // Biome does not infer Markdown from .txt; format stdin and compare or write ourselves.
  for (const file of files.filter(file => basename(file) === 'llms.txt')) {
    const path = join(cwd, file)
    const original = readFileSync(path)
    const result = Bun.spawnSync(
      [installedBiome, 'format', '--write', `--stdin-file-path=${file}.md`],
      { cwd, env, stdin: original, stdout: 'pipe', stderr: 'pipe' },
    )
    if (result.exitCode !== 0) throw new Error(`${file}: ${result.stderr}`)
    if (original.equals(result.stdout)) continue
    if (!write)
      throw new Error(
        `${file}: Markdown formatting differs; run bun run format:markdown.`,
      )
    writeFileSync(path, result.stdout)
  }
}

if (import.meta.main) {
  try {
    const mode = process.argv[2]
    if (!['--check', '--write', '--check-llms', '--write-llms'].includes(mode)) {
      throw new Error('Expected --check, --write, --check-llms, or --write-llms')
    }
    const cwd = process.cwd()
    const files = markdownFiles(cwd).filter(
      file => !mode.endsWith('-llms') || basename(file) === 'llms.txt',
    )
    formatMarkdown(files, cwd, mode.startsWith('--write'))
    console.log(
      `Markdown ${mode.startsWith('--write') ? 'format' : 'check'} passed (${files.length} files).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
