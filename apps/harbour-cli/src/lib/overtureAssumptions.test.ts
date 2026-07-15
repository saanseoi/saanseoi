import { describe, expect, test } from 'bun:test'

import { evaluateDivisionAssumptions } from './overtureAssumptions.ts'

describe('evaluateDivisionAssumptions', () => {
  test('accepts the current Hong Kong-style dropped-field profile', () => {
    expect(
      evaluateDivisionAssumptions({
        country: {
          distinctValues: ['"HK"'],
          nonNullCount: 1814,
        },
        theme: {
          distinctValues: ['"divisions"'],
          nonNullCount: 1814,
        },
        type: {
          distinctValues: ['"division"'],
          nonNullCount: 1814,
        },
        region: {
          distinctValues: [],
          nonNullCount: 0,
        },
        norms: {
          distinctValues: ['{"driving_side":"left"}'],
          nonNullCount: 1,
        },
      }),
    ).toEqual([])
  })

  test('warns when dropped-field assumptions drift', () => {
    expect(
      evaluateDivisionAssumptions({
        country: {
          distinctValues: ['"CN"', '"HK"'],
          nonNullCount: 25,
        },
        theme: {
          distinctValues: ['"boundaries"', '"divisions"'],
          nonNullCount: 25,
        },
        type: {
          distinctValues: ['"boundary"', '"division"'],
          nonNullCount: 25,
        },
        region: {
          distinctValues: ['"HK-001"'],
          nonNullCount: 7,
        },
        norms: {
          distinctValues: ['{"driving_side":"left"}', '{"driving_side":"right"}'],
          nonNullCount: 2,
        },
      }),
    ).toEqual([
      '\u001B[33m⚠\u001B[39m Dropped field \u001B[36m`country`\u001B[39m should be \u001B[32msingle-valued\u001B[39m; found \u001B[31m2 distinct non-null values\u001B[39m.',
      '\u001B[33m⚠\u001B[39m Dropped field \u001B[36m`theme`\u001B[39m should be \u001B[32msingle-valued\u001B[39m; found \u001B[31m2 distinct non-null values\u001B[39m.',
      '\u001B[33m⚠\u001B[39m Dropped field \u001B[36m`type`\u001B[39m should be \u001B[32msingle-valued\u001B[39m; found \u001B[31m2 distinct non-null values\u001B[39m.',
      '\u001B[33m⚠\u001B[39m Dropped field \u001B[36m`region`\u001B[39m should be \u001B[32mall null\u001B[39m; found \u001B[31m7 non-null rows\u001B[39m.',
      '\u001B[33m⚠\u001B[39m Dropped field \u001B[36m`norms`\u001B[39m should be \u001B[32meffectively uniform\u001B[39m; found \u001B[31m2 distinct non-null values\u001B[39m.',
    ])
  })
})
