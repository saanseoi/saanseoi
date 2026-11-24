// FlatGeobuf logs every spatial-index node; remove debug calls from the timed build.
const result = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  target: 'browser',
  minify: true,
  drop: ['console.debug'],
})
if (!result.success) throw new AggregateError(result.logs, 'Benchmark build failed')
