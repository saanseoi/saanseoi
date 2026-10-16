import { initialiseMapControls } from './mapControls'

/** Compact, task-focused controls for the standalone local review page. */
export function initialiseReviewControls() {
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T
  const inspector = document.querySelector<HTMLElement>('.inspector')!
  const primary = document.createElement('div')
  primary.className = 'primary-actions buttons'
  const more = document.createElement('details')
  more.className = 'secondary-actions'
  const summary = document.createElement('summary')
  summary.textContent = 'More drawing tools'
  more.append(summary)
  const moreButtons = document.createElement('div')
  moreButtons.className = 'buttons'
  more.append(moreButtons)
  const sources = document.createElement('details')
  const sourceSummary = document.createElement('summary')
  sourceSummary.textContent = 'Use an existing area'
  sources.append(sourceSummary)
  const catalogue = get('catalogue-search').closest('details')!
  const buildings = get('building-gap').closest('details')!
  const sourceLabel = document.querySelector('label[for="geometry-source"]')!
  sources.append(
    catalogue,
    buildings,
    get('copy-preview'),
    sourceLabel,
    get('geometry-source'),
    get('load-government'),
    get('copy'),
  )
  for (const id of ['adjoin', 'edit', 'pencil', 'draw']) primary.append(get(id))
  for (const id of [
    'expand-pencil',
    'move',
    'part',
    'remove-holes',
    'adjoin-street',
    'remove',
  ])
    moreButtons.append(get(id))
  inspector.querySelector(':scope > .buttons')?.remove()
  // Straight-line details may have been left empty after moving its button.
  for (const details of inspector.querySelectorAll('details'))
    if (details.children.length === 1) details.remove()
  get('evidence').hidden = true
  get('evidence').after(primary, more, sources)
  for (const [id, label] of [
    ['adjoin', 'Adjoin'],
    ['edit', 'Edit'],
    ['pencil', 'Street'],
    ['draw', 'Pencil'],
  ]) {
    get(id!).setAttribute('aria-label', label!)
    get(id!).title = label!
  }
  get('pencil').textContent = 'Street Snap Pencil'
  get('expand-pencil').textContent = 'Expand area · pencil'
  get('draw').textContent = 'Pencil'
  const buttons = [
    ...primary.querySelectorAll('button'),
    ...moreButtons.querySelectorAll('button'),
    get<HTMLButtonElement>('copy'),
    get<HTMLButtonElement>('copy-preview'),
  ]
  const refresh = () => {
    for (const button of buttons)
      button.hidden = primary.contains(button)
        ? false
        : button.disabled || button.id === 'expand-pencil'
    const hasArea = !get<HTMLButtonElement>('edit').disabled
    get('pencil').textContent = 'Street Snap Pencil'
    primary.classList.toggle('has-area', hasArea)
    more.hidden = ![...moreButtons.querySelectorAll('button')].some(
      button => !button.disabled,
    )
    const drawing = !get('drawing').hidden
    primary.hidden = drawing
    more.hidden = more.hidden || drawing
    sources.hidden = drawing
    sourceLabel.toggleAttribute(
      'hidden',
      !get<HTMLSelectElement>('geometry-source').options.length,
    )
    get('geometry-source').hidden =
      !get<HTMLSelectElement>('geometry-source').options.length
  }
  const observer = new MutationObserver(refresh)
  for (const button of buttons)
    observer.observe(button, { attributes: true, attributeFilter: ['disabled'] })
  observer.observe(get('drawing'), { attributes: true, attributeFilter: ['hidden'] })
  observer.observe(get('geometry-source'), { childList: true })
  refresh()

  initialiseMapControls()
}
