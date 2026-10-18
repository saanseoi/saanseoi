<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import * as ReleaseHeader from '#lib/bits/pages/docs/components/releaseHeader/index.js'
import * as ReleaseNav from '#lib/bits/pages/docs/components/releaseNav/index.js'
import Downloads from '#lib/bits/pages/basemaps/basemapReleaseDownloads.svelte'
import Routing from '#lib/bits/pages/basemaps/basemapReleaseRouting.svelte'
import ManifestInfo from '#lib/bits/pages/basemaps/basemapReleaseManifestInfo.svelte'
import Content from '#lib/bits/pages/basemaps/basemapReleaseContent.svelte'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
let { data } = $props()
const tabs = [
  { id: 'release', label: 'Release' },
  { id: 'changes', label: 'Changes' },
  { id: 'stats', label: 'Stats' },
  { id: 'map', label: 'Map' },
  { id: 'routing', label: 'Routing' },
]
let activeTab = $derived(
  tabs.find(tab => tab.id === page.url.searchParams.get('tab'))?.id ?? 'release',
)
let versions = $derived(
  data.versions.map(version => ({
    code: version,
    label: version,
    href: `/basemaps/releases/${data.region}/${version}?tab=${activeTab}`,
  })),
)
function selectTab(tab: string) {
  const url = new URL(page.url.href)
  url.searchParams.set('tab', tab)
  void goto(url, { reset: false })
}
</script>
<Seo
  title={`${data.current.region.description} basemap ${data.version}`}
  description={`Release details for SaanSeoi's ${data.current.region.description} basemap ${data.version}.`}
  type="article"
/>
<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.BasemapVariant
    manifest={data.current}
    manifestUrl={data.manifestUrl}
    viewerUrl={data.viewerUrl}
    previewImage={data.previewImage}
    current={data.versions[0] === data.version}
    accessMetrics={data.accessMetrics}
  />
  <ReleaseNav.Root
    analyticsSurface="basemaps"
    {versions}
    currentVersionCode={data.version}
    versionTitle="Versions"
    {tabs}
    {activeTab}
    onTabChange={selectTab}
    activeOutlineId={null}
    hasContent={true}
  >
    {#snippet tabAction()}
      {#if activeTab === 'release'}
        <Downloads
          region={data.region}
          version={data.version}
          pbfUrl={data.routing?.status === 'available' &&
          data.versions.indexOf(data.version) < 2
            ? data.routing.pbf.url
            : null}
        />
        <ManifestInfo />
      {/if}
    {/snippet}
    {#if activeTab === 'routing'}
      <Routing release={data.routing} />
    {:else}
      <Content
        statistics={data.statistics}
        current={data.current}
        previous={data.previous}
        previousVersion={data.previousVersion}
        catalogueAvailable={data.catalogueAvailable}
        {activeTab}
      />
    {/if}
  </ReleaseNav.Root>
</Main>
