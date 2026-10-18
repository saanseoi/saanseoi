/** Keep the merged feed append-only while older API pages are still pending. */
export function mergeDataReleaseFeed<
  ApiItem extends { release: { updatedAt: string } },
  BasemapItem extends { release: { version: string } },
>(apiItems: ApiItem[], basemapItems: BasemapItem[], hasMoreApiReleases: boolean) {
  const oldestLoadedApiDate = apiItems.length
    ? Math.min(...apiItems.map(item => Date.parse(item.release.updatedAt)))
    : Number.POSITIVE_INFINITY
  const entries = [
    ...apiItems.map(item => ({ item, date: Date.parse(item.release.updatedAt) })),
    ...basemapItems
      .filter(
        item =>
          !hasMoreApiReleases || Date.parse(item.release.version) > oldestLoadedApiDate,
      )
      .map(item => ({ item, date: Date.parse(item.release.version) })),
  ]
  return entries.sort((left, right) => right.date - left.date).map(entry => entry.item)
}
