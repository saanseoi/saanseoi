type Row = Record<string, any>
export type AliasRuleAudit = {
  id: string
  locale: string
  suffix: string
  replacement: string
  matched: number
  changed: number
  records: Array<{ divisionId: string; name: string; alias: string; changed: boolean }>
}
const array = (v: any): any[] => (typeof v === 'string' ? JSON.parse(v) : (v ?? []))
const aliases = (row: Row) =>
  new Set([
    ...(row.nameAlts?.split('|') ?? []),
    ...array(row.nameVariant),
    ...array(row.nameRules).map((r: Row) => r.value),
  ])
export function createAliasAudit(rules: Row[]): AliasRuleAudit[] {
  return rules.map((r, i) => ({
    id: `name-alias.${i + 1}`,
    locale: r.locale,
    suffix: r.suffix,
    replacement: r.replacement,
    matched: 0,
    changed: 0,
    records: [],
  }))
}
export function recordAliasAudit(
  audit: AliasRuleAudit[],
  id: string,
  before: Row[],
  after: Row[],
) {
  for (const rule of audit)
    for (const name of before) {
      if (name.locale !== rule.locale || !name.name?.endsWith(rule.suffix)) continue
      const alias = name.name.slice(0, -rule.suffix.length) + rule.replacement
      const output = after.find(row => row.locale === rule.locale)
      const changed =
        !aliases(name).has(alias) && !!output && aliases(output).has(alias)
      rule.matched++
      if (changed) rule.changed++
      rule.records.push({ divisionId: id, name: name.name, alias, changed })
    }
}
/** Replay the frozen primary-name decisions, then compare aliases with the saved output. */
export function reconstructAliasAudit(evidence: Row) {
  const rules = createAliasAudit(evidence.definitions.names.nameAliasRules)
  const output = new Map<string, Row[]>()
  for (const row of evidence.names)
    output.set(row.divisionId, [...(output.get(row.divisionId) ?? []), row])
  for (const [id, after] of output) {
    const change = evidence.changes.find((row: Row) => row.id === id)
    const authored = evidence.definitions.additions.entries.find(
      (row: Row) => row.id === id,
    )
    let before: Row[] = structuredClone(
      change?.names?.before?.length
        ? change.names.before
        : authored
          ? Object.entries(authored.names).map(([locale, name]) => ({ locale, name }))
          : [],
    )
    const patch = evidence.definitions.names.entries.find(
      (row: Row) => row.divisionId === id,
    )
    for (const [locale, value] of Object.entries(patch?.names ?? {}) as [
      string,
      Row,
    ][]) {
      if (value.remove) before = before.filter(row => row.locale !== locale)
      else if (value.name) {
        const row = before.find(row => row.locale === locale)
        if (row) row.name = value.name
        else before.push({ locale, name: value.name })
      }
    }
    for (const event of evidence.updateDecisions ?? []) {
      const locale = event.field?.match(/^names\.(.+)\.name$/)?.[1]
      if (
        event.divisionId !== id ||
        !locale ||
        !['keep', 'restored', 'accept'].includes(event.status)
      )
        continue
      const name = event.status === 'accept' ? event.proposed : event.before
      const row = before.find(row => row.locale === locale)
      if (row) row.name = name
      else before.push({ locale, name })
    }
    if (
      !before.length &&
      after.some(row =>
        rules.some(
          rule => row.locale === rule.locale && row.name?.endsWith(rule.suffix),
        ),
      )
    )
      throw Error(`No frozen alias input for ${id}`)
    recordAliasAudit(rules, id, before, after)
  }
  return rules
}
