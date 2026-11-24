import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { exportDevSettings } from './dev'

test('local exports use the Caddy port and a persistent repository store', () => {
  expect(exportDevSettings({})).toEqual({
    port: 8793,
    inspectorPort: 9253,
    persistPath: resolve(import.meta.dir, '../../.local/d1/dev'),
  })
  expect(
    exportDevSettings({
      EXPORT_PORT: '18893',
      EXPORT_PERSIST_PATH: '/tmp/export-fixture',
    }).persistPath,
  ).toBe('/tmp/export-fixture')
})

test('invalid listener settings fail before starting Wrangler', () => {
  for (const value of ['0', 'NaN', '8793.5', '70000'])
    expect(() => exportDevSettings({ EXPORT_PORT: value })).toThrow()
  expect(() => exportDevSettings({ EXPORT_INSPECTOR_PORT: '8793' })).toThrow(
    'must differ',
  )
})
