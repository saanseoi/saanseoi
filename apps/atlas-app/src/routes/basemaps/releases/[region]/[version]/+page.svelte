<script lang="ts">
import {
  Main,
  PageDescription,
  PageHeader,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from '$lib/bits'

let { data } = $props()
const schemaVersion = 'protomaps-v4.0'
const releaseVersion = $derived(`${data.version}.0`)
const viewerUrl = $derived(
  `https://viewer.saanseoi.hk/?region=${data.region}&version=${data.version}&theme=midnight&locale=en`,
)
</script>

<svelte:head>
  <title>{data.regionName} basemap {releaseVersion} | SaanSeoi</title>
  <meta
    name="description"
    content={`Release notes for SaanSeoi's ${data.regionName} basemap ${releaseVersion}.`}
  >
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <PageHeader>
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      Basemap release
    </p>
    <PageTitle>{data.regionName} · {releaseVersion}</PageTitle>
    <PageDescription>
      An enriched Protomaps Basemap Layers release built monthly from an OpenStreetMap
      extract with added regional boundaries, coastlines and geometry fixes.
    </PageDescription>
  </PageHeader>

  <PageSection id="schema" class="mt-16 max-w-4xl">
    <PageSectionTitle>Schema</PageSectionTitle>
    <p class="mt-5 font-body text-body-md leading-7 text-foreground-alt">
      <code class="font-mono text-sm text-foreground">{schemaVersion}</code>
      extends
      <a
        class="font-semibold text-primary underline decoration-secondary/45 underline-offset-4"
        href="https://docs.protomaps.com/basemaps/layers"
        target="_blank"
        rel="noreferrer"
        >Protomaps Basemap Layers</a
      >. Its SaanSeoi increment covers regional boundary, coastline, earth and water
      additions.
    </p>
  </PageSection>

  <PageSection class="mt-12 max-w-4xl">
    <PageSectionTitle>Release artefacts</PageSectionTitle>
    <div class="mt-5 flex flex-wrap gap-3">
      <a
        class="inline-flex rounded-full border border-outline-variant px-4 py-2 font-body text-label-md font-bold text-primary no-underline transition-colors hover:bg-surface-container"
        href={data.manifestUrl}
        target="_blank"
        rel="noreferrer"
        >Release manifest</a
      >
      <a
        class="inline-flex rounded-full bg-primary px-4 py-2 font-body text-label-md font-bold text-on-primary no-underline transition-colors hover:opacity-90"
        href={viewerUrl}
        target="_blank"
        rel="noreferrer"
        >Preview map</a
      >
    </div>
  </PageSection>
</Main>
