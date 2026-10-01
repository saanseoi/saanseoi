export const layerGroups = [
  {
    title: 'Admin',
    layers: [
      ['admin-0', 'SAR'],
      ['admin-1', 'Area'],
      ['admin-2', 'District'],
    ],
  },
  {
    title: 'Locality',
    layers: [
      ['city', 'City'],
      ['town', 'Town'],
      ['village', 'Village'],
      ['hamlet', 'Hamlet'],
    ],
  },
  {
    title: 'Hood',
    layers: [
      ['macrohood', 'Macro'],
      ['neighbourhood', 'Meso'],
      ['microhood', 'Micro'],
    ],
  },
  {
    title: 'Islands',
    layers: [
      ['island-custom', 'Custom'],
      ['island-proto', 'Proto'],
    ],
  },
] as const

export function divisionLayerKey(
  division: {
    id: string
    category: string | null
    class: string | null
    level: number | null
  },
  drawnIds: Set<string>,
) {
  if (division.category === 'administrative') return `admin-${division.level}`
  if (division.category === 'landform')
    return drawnIds.has(division.id) || division.class === 'island_group'
      ? 'island-custom'
      : 'island-proto'
  return division.class ?? ''
}

export function createLayerControls(host: HTMLElement, changed: () => void) {
  const enabled = new Set<string>(['macrohood', 'island-custom', 'island-proto'])
  const inputs = new Map<string, HTMLInputElement>()
  for (const group of layerGroups) {
    const fieldset = document.createElement('fieldset')
    const legend = document.createElement('legend')
    legend.textContent = group.title
    fieldset.append(legend)
    for (const [key, title] of group.layers) {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = enabled.has(key)
      input.setAttribute('aria-label', `${group.title} ${title}`)
      input.onchange = () => {
        if (input.checked) enabled.add(key)
        else enabled.delete(key)
        changed()
      }
      label.append(input, title)
      fieldset.append(label)
      inputs.set(key, input)
    }
    host.append(fieldset)
  }
  const governmentLabel = document.createElement('label')
  governmentLabel.id = 'government-district-control'
  const governmentInput = document.createElement('input')
  governmentInput.type = 'checkbox'
  governmentInput.setAttribute('aria-label', 'C&SD 2024')
  governmentInput.onchange = () => {
    if (governmentInput.checked) enabled.add('hkgov-censtatd-2024')
    else enabled.delete('hkgov-censtatd-2024')
    changed()
  }
  governmentLabel.append(governmentInput, 'C&SD 2024')
  host.append(governmentLabel)
  inputs.set('hkgov-censtatd-2024', governmentInput)
  return {
    has: (key: string) => enabled.has(key),
    show: (key: string) => {
      enabled.add(key)
      const input = inputs.get(key)
      if (input) input.checked = true
    },
  }
}
