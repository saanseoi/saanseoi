import { registerRule } from '../../provenance/auditTypes'

export const populationThousandsRule = registerRule(
  {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'normalise_censtatd_population_thousands_to_persons',
    scope: 'bulk',
    basis: 'code',
    summary: 'Convert population in thousands to persons using decimal arithmetic.',
    inputs: ['publisher-properties.MYPOPN_LAND'],
    outputs: ['statsRecords.values'],
    parameters: { sourceField: 'MYPOPN_LAND', factor: 1000 },
    implementation: {
      path: 'libs/core/src/pipeline/services/statisticRules.ts',
      symbol: 'populationThousandsRule',
    },
  },
  (value: string, parameters) => {
    const exponent = Math.log10(parameters.factor)
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(value))
      throw new Error('Population scaling requires a decimal literal.')
    const sign = value.startsWith('-') ? '-' : ''
    const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.')
    const digits =
      `${whole}${fraction.padEnd(exponent, '0').slice(0, exponent)}`.replace(
        /^0+(?=\d)/,
        '',
      )
    const remaining = fraction.slice(exponent)
    return `${sign}${digits}${remaining ? `.${remaining}` : ''}`
  },
)
