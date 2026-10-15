import { expect, test } from 'bun:test'

test('prints the skipped release and full reason without truncating it into a status cell', async () => {
  const script = `
    import { UpdateRow } from ${JSON.stringify(`${import.meta.dir}/updateDisplay.ts`)};
    import { loadDatasetFixtures } from ${JSON.stringify(`${import.meta.dir}/../sources/sourceUpdates.ts`)};
    const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-overture-place']));
    const decision = dataset.skippedReleases[0];
    new UpdateRow(dataset).skippedRelease({
      dataset, status: 'skipped', version: decision.sourceVersion, message: decision.reason,
    });
  `
  const child = Bun.spawn([process.execPath, '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(code).toBe(0)
  const output = Bun.stripANSI(stdout + stderr)
  expect(output).toContain('SKIPPED')
  expect(output).toContain('2026-09-23.1')
  expect(output.replace(/\s+/g, ' ')).toContain(
    'This patch does not affect the data ingested by SaanSeoi.',
  )
})
