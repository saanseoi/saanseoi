/** Scroll an element into view without hiding it beneath the site header. */
export function scrollToElementBelowHeader(element: Element) {
  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ?? 72
  window.scrollTo({
    behavior: 'smooth',
    top: window.scrollY + element.getBoundingClientRect().top - headerHeight - 16,
  })
}
