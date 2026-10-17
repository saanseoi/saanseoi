import { expect, test } from 'bun:test'
import {
  sourcePropertyPathFromPointer,
  sourcePropertyPathPattern,
} from './sourceAttribution'

test('converts upstream pointers to unambiguous dot paths', () => {
  for (const [pointer, path] of [
    ['', ''],
    ['/properties/names/common/lfn', 'properties.names.common.lfn'],
    ['/properties/names/rules/10', 'properties.names.rules.10'],
    ['/properties/operating_status', 'properties.operating_status'],
    ['/a.b/a~1b/~0/\\', 'a\\.b.a\\/b.~.\\\\'],
    ['/', '\\e'],
    ['//a/', '\\e.a.\\e'],
    ['/~01', '~1'],
  ]) {
    expect(sourcePropertyPathFromPointer(pointer!)).toBe(path!)
    expect(sourcePropertyPathPattern.test(path!)).toBe(true)
  }
  for (const path of ['/properties/names', 'a..b', '.a', 'a.', 'a\\q'])
    expect(sourcePropertyPathPattern.test(path)).toBe(false)
})
