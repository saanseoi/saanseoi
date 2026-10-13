import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  guardZedAgentLocations,
  MAX_AGENT_LOCATION_BYTES,
} from './zed-agent-location-guard.mjs'

// Optional integration target: node scripts/zed-agent-location-guard.test.mjs /path/to/dist/index.js
const bundlePath = process.argv[2]

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'zed-location-guard-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const small = join(dir, 'source.ts')
  const large = join(dir, 'ingestion.log')
  writeFileSync(small, 'export const value = 1\n')
  writeFileSync(large, '')
  truncateSync(large, MAX_AGENT_LOCATION_BYTES + 1)
  return { dir, small, large }
}

test('preserves source navigation, tool output and diffs while excluding large targets', t => {
  const { small, large } = fixture(t)
  const location = { path: small, line: 12, _meta: { test: true } }
  const call = {
    locations: [location, { path: large }],
    rawOutput: 'command result',
    content: [{ type: 'diff', path: small, newText: 'updated' }],
  }
  const content = call.content
  assert.equal(guardZedAgentLocations(call), call)
  assert.deepEqual(call.locations, [location])
  assert.equal(call.content, content)
  assert.equal(call.rawOutput, 'command result')
})

test('checks symlink targets and excludes directories, missing and relative paths', t => {
  const { dir, large } = fixture(t)
  const link = join(dir, 'linked.log')
  symlinkSync(large, link)
  const call = {
    locations: [link, dir, join(dir, 'missing'), 'relative.ts'].map(path => ({ path })),
  }
  assert.deepEqual(guardZedAgentLocations(call).locations, [])
  assert.equal(Object.hasOwn(guardZedAgentLocations({}), 'locations'), false)
})

test('accepts the size boundary and clears locations when a file grows', t => {
  const { small } = fixture(t)
  truncateSync(small, MAX_AGENT_LOCATION_BYTES)
  assert.equal(
    guardZedAgentLocations({ locations: [{ path: small }] }).locations.length,
    1,
  )
  truncateSync(small, MAX_AGENT_LOCATION_BYTES + 1)
  assert.deepEqual(
    guardZedAgentLocations({ locations: [{ path: small }] }).locations,
    [],
  )
})

test('installed renderer filters normal, history, update and permission locations after overrides', {
  skip: !bundlePath,
}, t => {
  const { small, large } = fixture(t)
  const source = readFileSync(bundlePath, 'utf8')
  const section = source.slice(
    source.indexOf('// src/tool-calls/AcpToolCallRenderer.ts'),
    source.indexOf('// src/ToolCallName.ts'),
  )
  const Renderer = runInNewContext(`${section}\nAcpToolCallRenderer`, {
    guardZedAgentLocations,
  })
  const renderer = new Renderer({
    airClient: false,
    air: {},
    terminalOutputKey: () => null,
  })
  for (const report of ['start', 'update']) {
    const result = renderer.render({
      toolCallId: 'test',
      report,
      locations: [small],
      standard: { locations: [large] },
    })
    assert.equal(result.locations.length, 0)
    assert.equal(result.toolCallId, 'test')
  }
  const permission = renderer.renderPermissionToolCall({
    toolCallId: 'permission',
    locations: [large],
    standard: { locations: [small, large] },
  })
  assert.deepEqual(
    permission.locations.map(location => location.path),
    [small],
  )
})
