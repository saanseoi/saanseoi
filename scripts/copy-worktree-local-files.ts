import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
    stderr: 'pipe',
    stdout: 'pipe',
  })

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `git ${args.join(' ')} failed`)
  }

  return result.stdout.toString()
}

function primaryWorktree(repoRoot: string): string {
  const worktrees = git(repoRoot, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length).trim())

  const primary = worktrees[0]
  if (!primary) {
    throw new Error('could not find the primary worktree')
  }

  return resolve(primary)
}

function ignoredEnvironmentFiles(repoRoot: string): string[] {
  return git(repoRoot, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean)
    .filter(path => {
      const name = basename(path)
      return name.startsWith('.env') || name.startsWith('.dev.vars')
    })
}

const currentWorktree = resolve(
  git(process.cwd(), ['rev-parse', '--show-toplevel']).trim(),
)
const primary = primaryWorktree(currentWorktree)

if (currentWorktree === primary) {
  process.exit(0)
}

const copied: string[] = []

for (const relativePath of ignoredEnvironmentFiles(primary)) {
  const source = join(primary, relativePath)
  const destination = join(currentWorktree, relativePath)

  if (!statSync(source).isFile() || existsSync(destination)) {
    continue
  }

  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  copied.push(relativePath)
}

if (copied.length > 0) {
  console.log(
    `Copied ${copied.length} local environment file${copied.length === 1 ? '' : 's'}:`,
  )
  for (const path of copied) {
    console.log(`  ${path}`)
  }
}
