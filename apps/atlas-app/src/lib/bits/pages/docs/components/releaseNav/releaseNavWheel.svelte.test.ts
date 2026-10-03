import { afterEach, beforeEach, expect, test } from 'vitest'

import { routeReleaseNavWheel } from './releaseNavWheel'

let node: HTMLDivElement
let panel: HTMLDivElement

beforeEach(() => {
  node = document.createElement('div')
  node.style.cssText = 'position:absolute;top:400px;height:2000px;width:400px'
  const controls = document.createElement('div')
  controls.setAttribute('data-release-nav-controls', '')
  controls.style.cssText = 'position:sticky;top:72px;height:40px'
  panel = document.createElement('div')
  panel.setAttribute('data-release-nav-content-body', '')
  panel.style.cssText = 'height:200px;overflow-y:auto'
  const text = document.createElement('div')
  text.style.height = '1200px'
  panel.append(text)
  node.append(controls, panel)
  document.body.append(node)
  window.scrollTo({ top: 0, behavior: 'instant' })
  node.addEventListener('wheel', event => routeReleaseNavWheel(node, event))
})

afterEach(() => {
  node.remove()
  window.scrollTo({ top: 0, behavior: 'instant' })
})

function wheel(deltaY: number) {
  panel.dispatchEvent(
    new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }),
  )
}

test('scrolls text back up after an anchor jump above the pinned page position', () => {
  panel.scrollTop = 500

  wheel(-200)

  expect(panel.scrollTop).toBe(300)
  expect(window.scrollY).toBe(0)
})

test('passes remaining upward movement to the page after reaching the text start', () => {
  window.scrollTo({ top: 328, behavior: 'instant' })
  panel.scrollTop = 50

  wheel(-100)

  expect(panel.scrollTop).toBe(0)
  expect(window.scrollY).toBe(278)
})

test('scrolls text down while the page is above the pinned position', () => {
  wheel(400)

  expect(window.scrollY).toBe(0)
  expect(panel.scrollTop).toBe(400)
})

test.each([200, -200])(
  'scrolls text by %i while the outer page is past the pinned position',
  delta => {
    window.scrollTo({ top: 450, behavior: 'instant' })
    panel.scrollTop = 500

    wheel(delta)

    expect(panel.scrollTop).toBe(500 + delta)
    expect(window.scrollY).toBe(450)
  },
)

test('passes remaining downward movement to the page at the text end', () => {
  window.scrollTo({ top: 450, behavior: 'instant' })
  panel.scrollTop = 950

  wheel(100)

  expect(panel.scrollTop).toBe(1000)
  expect(window.scrollY).toBe(500)
})
