export type CleanupTarget = { id: string; name: string; group: string }

export function createCleanupTargets(actions: {
  candidates: () => CleanupTarget[]
  selected: () => CleanupTarget[]
  add: (ids: string[]) => void
  remove: (id: string) => void
}) {
  const get = (id: string) => document.getElementById(id)!
  const container = document.createElement('div')
  container.className = 'cleanup-targets'
  const label = document.createElement('label')
  label.textContent = 'Target group'
  const group = document.createElement('select')
  group.id = 'cleanup-target-group'
  const groups = [
    ['3', 'L3 · Towns'],
    ['4', 'L4 · Neighbourhoods'],
    ['5', 'L5 · Villages'],
    ['6', 'L6 · Areas'],
    ['islands', 'Islands'],
  ]
  for (const [value, title] of groups) group.add(new Option(title, value))
  group.value = '4'
  label.append(group)
  const add = document.createElement('button')
  add.id = 'cleanup-add-matches'
  const run = document.createElement('button')
  run.id = 'cleanup-run'
  const note = document.createElement('p')
  note.className = 'section-note'
  const list = document.createElement('div')
  list.className = 'cleanup-target-list'
  list.setAttribute('aria-label', 'Selected cleanup targets')
  const legacy = [
    'clean-town',
    'clean-level-4',
    'clean-level-5',
    'clean-level-6',
    'clean-islands',
  ]
  for (const id of legacy) get(id).hidden = true
  const sourceButton = () =>
    get(
      legacy[groups.findIndex(([value]) => value === group.value)]!,
    ) as HTMLButtonElement
  const refresh = () => {
    const busy = (get('cleanup-select-mode') as HTMLInputElement).disabled
    const chosen = actions.selected()
    const ids = new Set(chosen.map(target => target.id))
    const matches = actions
      .candidates()
      .filter(target => target.group === group.value && !ids.has(target.id))
    const applicable = chosen.filter(target => target.group === group.value)
    add.textContent = `Add matching results (${matches.length})`
    add.disabled = busy || !matches.length
    group.disabled = busy
    run.disabled = sourceButton().disabled
    run.textContent = `${group.value === 'islands' ? 'Clip to coastline' : 'Clean boundaries'} (${applicable.length})`
    note.textContent = `${applicable.length} targets in this group · ${chosen.length} selected in total. Adding results uses the current search, result filters and visible layers.`
    list.replaceChildren(
      ...chosen.map(target => {
        const button = document.createElement('button')
        button.textContent = `${target.name} ×`
        button.setAttribute('aria-label', `Remove ${target.name} from cleanup`)
        button.disabled = busy
        button.onclick = () => actions.remove(target.id)
        return button
      }),
    )
  }
  group.onchange = refresh
  add.onclick = () =>
    actions.add(
      actions
        .candidates()
        .filter(target => target.group === group.value)
        .map(target => target.id),
    )
  run.onclick = () => sourceButton().click()
  container.append(label, add, note, list, run)
  get('cleanup-selection-count').before(container)
  const observer = new MutationObserver(refresh)
  for (const id of [...legacy, 'cleanup-select-mode'])
    observer.observe(get(id), { attributes: true, attributeFilter: ['disabled'] })
  observer.observe(get('cleanup-selection-count'), { childList: true })
  refresh()
}
