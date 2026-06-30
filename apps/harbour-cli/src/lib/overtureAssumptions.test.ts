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
      'Dropped field `country` is no longer single-valued; found 2 distinct non-null values.',
      'Dropped field `theme` is no longer single-valued; found 2 distinct non-null values.',
      'Dropped field `type` is no longer single-valued; found 2 distinct non-null values.',
      'Dropped field `region` is no longer all null; found 7 non-null rows.',
      'Dropped field `norms` is no longer effectively uniform; found 2 distinct non-null values.',
    ])
  })
})
