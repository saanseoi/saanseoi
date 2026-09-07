import { expect, test } from 'bun:test'

test('preflight phases replace the active terminal row on success and failure', () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      '--eval',
      `
    import { progressPhase } from ${JSON.stringify(`${import.meta.dir}/progressPhase.ts`)};
    import { installInitialisationIndent } from ${JSON.stringify(`${import.meta.dir}/../../../harbour-cli/src/lib/cli/initialisationIndent.ts`)};
    installInitialisationIndent('hkgov-dpo:ingest');
    const value = await progressPhase('Resolve releases', async () => {
      await Bun.sleep(180);
      return 42;
    });
    if (value !== 42) throw new Error('Lost result');
    const failure = new Error('Curation required');
    try {
      await progressPhase('Review release', async () => {
        await Bun.sleep(180);
        throw failure;
      });
      process.exit(2);
    } catch (error) {
      if (error !== failure) process.exit(3);
    }
  `,
    ],
    {
      env: {
        ...process.env,
        SAANSEOI_TERMINAL_INTERACTIVE: '1',
        SAANSEOI_TERMINAL_COLUMNS: '80',
        SAANSEOI_INIT_GUIDES: '0,4',
        SAANSEOI_INIT_COMMAND: 'init:addresses:saanseoi',
        TERM: 'xterm-256color',
        CI: 'false',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  expect(result.exitCode).toBe(0)
  const output = result.stdout.toString()
  expect(output).toContain('\u001b[5G\u001b[J')
  const lines = Bun.stripANSI(output).split('\n')
  expect(lines.filter(line => line.includes('Resolve releases'))).toHaveLength(1)
  expect(lines.filter(line => line.includes('Review release'))).toHaveLength(1)
  expect(output).toContain('Resolve releases (0s)')
  expect(output).toContain('Review release failed (0s)')
})
