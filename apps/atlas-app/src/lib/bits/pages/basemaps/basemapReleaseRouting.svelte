<script lang="ts">
import Section from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSection.svelte'
import Header from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsSectionHeader.svelte'
import type { RoutingRelease } from '#lib/registry/routingRelease.js'
let { release }: { release: RoutingRelease | null } = $props()
const engines = ['valhalla', 'graphhopper'] as const
const packages = $derived(
  release
    ? engines.map(engine => ({
        engine,
        version: release.engines[engine].version,
        profiles: release.engines[engine].profiles,
        artifact: release.status === 'recipe-only' ? null : release.engines[engine],
      }))
    : [],
)
const command = $derived(
  release
    ? `curl -fL '${release.rebuildUrl}' -o rebuild.py\npython3 rebuild.py --recipe '${release.recipeUrl}' --out './${release.region}-${release.version}'`
    : '',
)
</script>

<div class="min-w-0 space-y-6 pb-6">
  <Section>
    <Header eyebrow="Routing packages" title="Street graphs" />
    <p
      class="max-w-2xl px-5 pt-5 font-body text-label-md leading-6 text-foreground-alt"
    >
      Built from this region’s archived OpenStreetMap source and boundary, with runtime
      configuration and attribution included.
    </p>
    {#if release && release.status !== 'available'}
      <p class="px-5 pt-3 font-body text-caption leading-6 text-foreground-alt">
        {release.status === 'recipe-only'
          ? 'Build recipes are available for this edition. Pre-built downloads are kept for the latest two releases.'
          : 'Pre-built downloads have been retired. Regenerate the graphs with the recorded recipe below.'}
      </p>
    {/if}
    {#if release}
      <div class="mt-2 divide-y divide-data-outline-variant/40">
        {#each packages as packageInfo}
          <article class="px-5 py-6">
            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
              <h3
                class="flex items-baseline gap-3 font-body text-body-md font-semibold text-primary"
              >
                {packageInfo.engine === 'valhalla' ? 'Valhalla' : 'GraphHopper'}
                <span class="font-mono text-label-md font-normal text-foreground-alt"
                  >{packageInfo.version}</span
                >
              </h3>
              {#if release.status === 'available' && packageInfo.artifact}
                <a
                  class="inline-flex items-baseline gap-3 font-body text-label-md text-data-primary underline underline-offset-4 decoration-data-primary/40 hover:decoration-data-primary focus-visible:outline-2 focus-visible:outline-data-primary"
                  href={packageInfo.artifact.url}
                >
                  Download graph
                  <span class="font-mono text-label-md text-foreground-alt"
                    >{(packageInfo.artifact.size / 1_000_000).toFixed(1)}
                    MB</span
                  >
                </a>
              {/if}
            </div>
            <p
              class="mt-3 max-w-2xl font-body text-label-md leading-6 text-foreground-alt"
            >
              {#if packageInfo.engine === 'valhalla'}
                One street graph for walking, cycling and driving. Choose the costing
                model and preferences per request.
              {:else}
                Prepared car, bike and foot profiles, including contraction hierarchies.
                Profile changes require a rebuild.
              {/if}
            </p>
            {#if packageInfo.artifact}
              <details class="mt-3 text-foreground-alt">
                <summary
                  class="w-fit cursor-pointer font-body text-caption hover:text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
                >
                  SHA-256 checksum
                </summary>
                <p class="mt-2 max-w-2xl break-all font-mono text-caption leading-6">
                  {packageInfo.artifact.sha256}
                </p>
              </details>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <p class="px-5 py-5 font-body text-label-md text-foreground-alt">
        No routing recipe is available for this edition.
      </p>
    {/if}
  </Section>
  {#if release}
    <Section>
      <Header
        eyebrow={`${release.region.toUpperCase()} · ${release.version}`}
        title="Build locally"
      >
        <a
          class="font-body text-label-md text-data-primary underline underline-offset-4 decoration-data-primary/40 hover:decoration-data-primary"
          href={release.recipeUrl}
          >Download build recipe</a
        >
      </Header>
      <p class="px-5 pt-5 font-body text-label-md leading-6 text-foreground-alt">
        Python 3.11+, osmium-tool and Docker. Source, boundary, engine versions and
        configuration are pinned in the recipe.
      </p>
      <pre
        class="m-5 overflow-x-auto rounded-md bg-data-surface-container-lowest p-4 font-mono text-label-md leading-7 text-foreground-alt"
      ><code>{command}</code></pre>
      <details
        class="border-t border-data-outline-variant/40 px-5 py-4 font-body text-caption text-foreground-alt"
      >
        <summary
          class="w-fit cursor-pointer font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-data-primary"
        >
          Source data &amp; build notes
        </summary>
        <div class="mt-3 max-w-2xl space-y-3 leading-6">
          <p>
            Uses this release’s historical OpenStreetMap source with the engine versions
            shown above. Compressed archive bytes may differ between builds.
          </p>
          <p>
            Elevation, live traffic, transit feeds and administrative/time-zone
            databases are not included. Timetables and fares are not part of these
            packages.
          </p>
          <p>
            OpenStreetMap data is licensed under
            <a
              class="text-data-primary underline underline-offset-4"
              href="https://www.openstreetmap.org/copyright"
              >ODbL 1.0</a
            >.
          </p>
        </div>
      </details>
    </Section>
  {/if}
</div>
