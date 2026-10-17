/** Relocate existing controls so their state and geometry handlers stay intact. */
export function initialiseMapControls() {
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T
  const inventory = document.querySelector<HTMLElement>('.inventory')!
  const inspector = document.querySelector<HTMLElement>('.inspector')!
  const toolbar = document.querySelector<HTMLElement>('.toolbar')!
  const [layers, cleanup, project] = [
    ...toolbar.querySelectorAll<HTMLElement>('.control-section'),
  ]
  const display = document.createElement('details')
  display.className = 'display-controls'
  const displayTitle = document.createElement('summary')
  displayTitle.textContent = 'Layer Controls'
  display.open = true
  const displayHeader = document.createElement('div')
  displayHeader.className = 'layer-section'
  const highViz = get('show-polygon-display').closest('label')!
  display.append(displayTitle, layers!)
  highViz.classList.add('high-viz-switch')
  displayTitle.append(highViz)
  highViz.addEventListener('click', event => event.stopPropagation())
  displayHeader.append(display)
  inventory.querySelector('header')!.after(displayHeader)
  get('layer-controls-title').hidden = true
  get('polygon-display-legend').hidden = true
  const divisions = document.createElement('details')
  divisions.className = 'division-browser'
  divisions.open = true
  const title = document.createElement('summary')
  title.textContent = 'Divisions'
  divisions.append(
    title,
    get('search'),
    inventory.querySelector('.filters')!,
    get('results'),
    get('result-count'),
  )
  displayHeader.after(divisions)

  const actions = document.createElement('nav')
  actions.className = 'floating-actions'
  actions.setAttribute('aria-label', 'Editor actions')
  const toggle = document.createElement('button')
  toggle.id = 'toggle-cleanup'
  toggle.textContent = 'Clean up'
  toggle.setAttribute('aria-controls', 'cleanup-drawer')
  toggle.setAttribute('aria-expanded', 'false')
  cleanup!.id = 'cleanup-drawer'
  cleanup!.className = 'panel cleanup-panel'
  cleanup!.hidden = true
  const close = document.createElement('button')
  close.textContent = 'Close'
  close.className = 'close-cleanup'
  close.setAttribute('aria-label', 'Close cleanup')
  cleanup!.prepend(close)
  const selectionMode = get<HTMLInputElement>('cleanup-select-mode')
  selectionMode.closest('label')!.hidden = true
  toggle.onclick = () => {
    if (selectionMode.disabled) return
    const open = Boolean(cleanup!.hidden)
    cleanup!.hidden = !open
    inspector.hidden = open
    toggle.setAttribute('aria-expanded', String(open))
    selectionMode.checked = open
    selectionMode.dispatchEvent(new Event('change'))
  }
  close.onclick = () => toggle.click()
  const syncToggle = () => {
    toggle.disabled = selectionMode.disabled
    close.disabled = selectionMode.disabled
  }
  new MutationObserver(syncToggle).observe(selectionMode, {
    attributes: true,
    attributeFilter: ['disabled'],
  })
  syncToggle()
  get('download').textContent = 'Download'
  actions.append(toggle, get('download'))
  const projectTools = document.createElement('details')
  projectTools.className = 'project-tools'
  const projectTitle = document.createElement('summary')
  projectTitle.textContent = 'Project tools'
  get('review-controls-title').hidden = true
  projectTools.append(projectTitle, project!)
  project!.prepend(get('government-district-control'))
  const stats = document.createElement('details')
  stats.className = 'stats-section'
  const statsTitle = document.createElement('summary')
  statsTitle.textContent = 'Stats'
  stats.append(statsTitle, get('coverage'))
  inventory.append(projectTools, stats, get('overview'))
  get('ancestry').hidden = true
  for (const id of ['show-polygon-display', 'only-visible-layers', 'missing-area']) {
    const input = get<HTMLInputElement>(id)
    input.setAttribute('role', 'switch')
    input.closest('label')!.classList.add('switch-control')
  }
  const tools = document.createElement('aside')
  tools.className = 'editor-stack'
  tools.setAttribute('aria-label', 'Division editing tools')
  tools.append(inspector, cleanup!, actions)
  document.body.append(tools)
  toolbar.remove()
  cleanup!.querySelector('.section-note')!.textContent =
    'Select divisions on the map, then clean their shared boundaries or snap them to the coastline. Any division level can be selected.'
  const simplification = cleanup!.querySelector<HTMLDetailsElement>(
    '.simplification-tools',
  )!
  simplification.open = false
  simplification.querySelector('summary')!.textContent = 'Simplify boundaries'
  cleanup!.append(simplification)
  get('cleanup-clear-selection').textContent = 'Clear selection'
}
