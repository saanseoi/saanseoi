<script lang="ts">
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

<section class="min-w-0 space-y-8 pt-4 pb-6 lg:pt-0">
  <div>
    <h2 class="font-display text-headline-sm font-bold text-primary">Routing graphs</h2>
    <p class="mt-3 font-body text-body-md text-foreground-alt">
      Engine-specific street graphs from this region’s archived OpenStreetMap source and
      published boundary. Each package includes its runtime configuration, build recipe
      and OpenStreetMap attribution.
    </p>
    {#if release?.status === 'recipe-only'}
      <p
        class="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 font-body text-body-sm text-foreground-alt"
      >
        Build recipes are available for this historical release. Pre-built graph
        downloads are offered for the latest two releases.
      </p>
    {:else if release?.status === 'retired'}
      <p
        class="mt-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 font-body text-body-sm text-foreground-alt"
      >
        This release’s graph downloads have been retired. Use the recorded recipes below
        to regenerate them from the retained source and boundary.
      </p>
    {/if}
  </div>
  {#if release}
    <div class="grid gap-4 xl:grid-cols-2">
      {#each packages as packageInfo}
        <article class="flex min-w-0 flex-col rounded-lg border border-outline-variant">
          <div
            class="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-5 py-4"
          >
            <h3 class="font-body text-title-md font-semibold text-primary">
              {packageInfo.engine === 'valhalla' ? 'Valhalla' : 'GraphHopper'}
            </h3>
            <span
              class="rounded-md border border-outline-variant px-2 py-1 font-mono text-label-sm text-secondary"
              >v{packageInfo.version}</span
            >
          </div>
          <div class="flex flex-1 flex-col gap-5 p-5">
            <div>
              <p class="font-body text-label-md font-semibold text-primary">
                {packageInfo.engine === 'valhalla'
                  ? 'One graph, dynamic costing'
                  : 'Prepared routing profiles'}
              </p>
              <p class="mt-2 font-body text-body-sm leading-6 text-foreground-alt">
                {#if packageInfo.engine === 'valhalla'}
                  Walking, cycling and driving data share one graph. Choose a costing
                  model and its preferences when requesting a route; these are not
                  separately prepared profiles.
                {:else}
                  Includes car, bike and foot profiles with contraction hierarchy
                  preparations. The recipe records the profile configuration; changing
                  prepared profiles requires rebuilding the graph.
                {/if}
              </p>
            </div>
            <div
              class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-4"
            >
              {#if release.status === 'available' && packageInfo.artifact}
                <span class="font-mono text-title-md text-secondary"
                  >{(packageInfo.artifact.size / 1_000_000).toFixed(1)}
                  MB</span
                >
                <a
                  class="rounded-default border border-primary px-4 py-2 font-body text-label-md text-primary transition hover:bg-primary/10"
                  href={packageInfo.artifact.url}
                  >Download graph</a
                >
              {:else}
                <span class="font-body text-label-md text-foreground-alt"
                  >Generate locally with the recipe below</span
                >
              {/if}
            </div>
            {#if packageInfo.artifact}
              <details class="text-foreground-alt">
                <summary
                  class="cursor-pointer font-body text-label-sm hover:text-primary"
                >
                  SHA-256 checksum
                </summary>
                <p class="mt-2 break-all font-mono text-label-sm">
                  {packageInfo.artifact.sha256}
                </p>
              </details>
            {/if}
          </div>
        </article>
      {/each}
    </div>
    <section>
      <h2 class="font-display text-headline-sm font-bold text-primary">
        Build this release’s graphs
      </h2>
      <p class="mt-3 font-body text-body-md text-foreground-alt">
        The recipe pins the archived Guangdong source, this region’s boundary, engine
        versions and build configuration. Requires Python 3.11+, osmium-tool and Docker.
      </p>
      <div
        class="mt-5 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3 font-body text-label-md"
        >
          <span class="text-foreground-alt"
            >{release.region.toUpperCase()}
            · {release.version}</span
          >
          <a class="text-primary underline underline-offset-4" href={release.recipeUrl}
            >Download build recipe</a
          >
        </div>
        <pre
          class="overflow-x-auto p-5 font-mono text-label-md leading-7 text-primary"
        ><code>{command}</code></pre>
      </div>
      <p class="mt-3 font-body text-caption leading-6 text-foreground-alt">
        Uses this release’s historical OpenStreetMap source with the engine versions
        shown above. Compressed archive bytes may differ between builds.
      </p>
    </section>
    <section class="border-t border-outline-variant pt-5">
      <h3 class="font-body text-label-md font-semibold text-primary">Included data</h3>
      <p class="mt-2 font-body text-body-sm leading-6 text-foreground-alt">
        Street access and attributes from OpenStreetMap. Elevation, live traffic,
        transit feeds and administrative/time-zone databases are not included. Public
        transport timetables and fares are not part of these packages. Source data is
        licensed under
        <a
          class="text-primary underline underline-offset-4"
          href="https://www.openstreetmap.org/copyright"
          >ODbL 1.0</a
        >.
      </p>
    </section>
  {:else}
    <p class="font-body text-body-md text-foreground-alt">
      No routing recipe is available for this edition.
    </p>
  {/if}
</section>
