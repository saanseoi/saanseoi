type Division = { id: string; category: string | null }
export function coverageSummary(divisions: Division[], areaIds: Iterable<string>) {
  const covered = new Set(areaIds)
  const rows = [...new Map(divisions.map(d => [d.id, d])).values()]
  return [null, 'administrative', 'locality', 'hood', 'landform'].map(category => {
    const group = category === null ? rows : rows.filter(d => d.category === category)
    return {
      total: group.length,
      coverage: group.filter(d => covered.has(d.id)).length,
    }
  })
}

export function renderCoverage(
  host: HTMLElement,
  divisions: Division[],
  areaIds: Iterable<string>,
) {
  const counts = coverageSummary(divisions, areaIds)
  const table = document.createElement('table')
  table.className = 'coverage-summary'
  table.setAttribute('aria-label', 'Division totals and area coverage')
  const head = table.createTHead().insertRow()
  for (const label of ['', 'Divisions', 'Admin', 'Locality', 'Hoods', 'Islands']) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    head.append(th)
  }
  for (const key of ['total', 'coverage'] as const) {
    const row = table.insertRow()
    const label = document.createElement('th')
    label.scope = 'row'
    label.textContent = key === 'total' ? 'Total' : 'Coverage'
    row.append(label)
    for (const count of counts)
      row.insertCell().textContent = count[key].toLocaleString()
  }
  host.replaceChildren(table)
}
