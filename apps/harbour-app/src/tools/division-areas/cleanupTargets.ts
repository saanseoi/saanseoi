export type CleanupTarget = { id: string; name: string; group: string }

export function createCleanupTargets(actions: {
  candidates: () => CleanupTarget[]
  selected: () => CleanupTarget[]
  add: (ids: string[]) => void
  remove: (id: string) => void
  run: (operation: 'boundaries' | 'coast') => void
}) {
  const get = (id: string) => document.getElementById(id)!
  const container = document.createElement('div')
  container.className = 'cleanup-targets'
  const title = document.createElement('strong')
  title.textContent = 'Selected divisions'
  const add = document.createElement('button')
  add.id = 'cleanup-add-matches'
  const run = document.createElement('button')
  run.id = 'cleanup-run'
  const coast = document.createElement('button')
  coast.id = 'cleanup-coast'
  coast.textContent = 'Snap to coastline'
  const note = document.createElement('p')
  note.className = 'section-note'
  const list = document.createElement('div')
  list.className = 'cleanup-target-list'
  list.setAttribute('aria-label', 'Selected cleanup targets')
  for (const id of [
    'clean-town',
    'clean-level-4',
    'clean-level-5',
    'clean-level-6',
    'clean-islands',
  ])
    get(id).hidden = true
  const refresh = () => {
    const busy = (get('cleanup-select-mode') as HTMLInputElement).disabled
    const chosen = actions.selected()
    const ids = new Set(chosen.map(target => target.id))
    const matches = actions.candidates().filter(target => !ids.has(target.id))
    add.textContent = `Add matching results (${matches.length})`
    add.disabled = busy || !matches.length
    run.disabled = busy || chosen.length < 2
    coast.disabled = busy || !chosen.length
    run.textContent = `Clean shared boundaries (${chosen.length})`
    note.textContent = chosen.length
      ? 'Click a selected polygon or its name below to remove it.'
      : 'Click polygons on the map, or add the filtered results from visible layers.'
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
  add.onclick = () => actions.add(actions.candidates().map(target => target.id))
  run.onclick = () => actions.run('boundaries')
  coast.onclick = () => actions.run('coast')
  container.append(title, note, add, list, run, coast)
  get('cleanup-selection-count').before(container)
  const observer = new MutationObserver(refresh)
  observer.observe(get('cleanup-select-mode'), {
    attributes: true,
    attributeFilter: ['disabled'],
  })
  observer.observe(get('cleanup-selection-count'), { childList: true })
  refresh()
}
