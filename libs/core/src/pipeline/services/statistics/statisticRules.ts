import { registerRule } from '../../../provenance/auditTypes'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import declaration from '../../../../../../fixtures/meta/processing-rules/censtatd-population-thousands-to-persons.json'

export const populationThousandsRule = registerRule(
  ruleDeclarationFromFixture(declaration),
  (value: string, parameters) => {
    const exponent = Math.log10(parameters.factor)
    if (
      !Number.isSafeInteger(parameters.factor) ||
      !Number.isInteger(exponent) ||
      exponent < 0
    )
      throw new Error('Population scaling requires a positive power-of-ten factor.')
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
