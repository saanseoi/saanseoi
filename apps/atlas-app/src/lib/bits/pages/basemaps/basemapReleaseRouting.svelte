<script lang="ts">
import type { RoutingRelease } from '#lib/registry/routingRelease.js'
let { release }: { release: RoutingRelease | null } = $props()
const command = $derived(
  release
    ? `curl -fL '${release.rebuildUrl}' -o rebuild.py\npython3 rebuild.py --recipe '${release.recipeUrl}' --out './${release.region}-${release.version}'`
    : '',
)
</script>

<section class="flex flex-col gap-6 py-6">
  <p class="text-body-md text-foreground-alt">
    Engine-specific graphs built from this region’s archived OpenStreetMap source and
    published boundary. The source data is licensed under ODbL 1.0.
  </p>
  {#if release}
    <div class="grid gap-4 sm:grid-cols-2">
      {#each Object.entries(release.engines) as [engine, packageInfo]}
        <article
          class="flex flex-col gap-3 rounded-default border border-outline-variant p-5"
        >
          <h3 class="font-body text-title-md font-semibold">
            {engine === 'valhalla' ? 'Valhalla' : 'GraphHopper'} {packageInfo.version}
          </h3>
          <p class="text-body-sm text-foreground-alt">
            Profiles: {packageInfo.profiles.join(', ')} ·
            {(packageInfo.size / 1_000_000).toFixed(1)}
            MB
          </p>
          {#if release.status === 'available'}
            <a
              class="self-start rounded-default border border-primary px-4 py-2 text-primary hover:bg-primary/10"
              href={packageInfo.url}
              >Download graph</a
            >
          {:else}
            <p class="text-body-sm text-foreground-alt">
              Download retired. Regenerate this package with the recorded recipe below.
            </p>
          {/if}
          <p class="break-all font-mono text-label-sm text-foreground-alt">
            SHA-256: {packageInfo.sha256}
          </p>
        </article>
      {/each}
    </div>
    <div class="flex flex-col gap-3">
      <h3 class="font-body text-title-md font-semibold">
        Rebuild this region’s graphs
      </h3>
      <p class="text-body-sm text-foreground-alt">
        Requires Python 3, osmium-tool and Docker. The recipe pins the Guangdong source,
        regional boundary, engines and build configuration. GraphHopper requires Java 21
        or newer when using its native Java recipe.
      </p>
      <pre
        class="overflow-x-auto rounded-default bg-surface-container-low p-4 font-mono text-label-md"
      ><code>{command}</code></pre>
      <a class="text-primary underline" href={release.recipeUrl}
        >Download build recipe</a
      >
    </div>
    {#each release.limitations as limitation}
      <p class="text-body-sm text-foreground-alt">{limitation}</p>
    {/each}
  {:else}
    <p class="text-body-md text-foreground-alt">
      No routing package has been published for this edition.
    </p>
  {/if}
</section>
