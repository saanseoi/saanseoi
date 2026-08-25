<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

type Props = {
  family: string
  sourceReleaseCode: string
  sourceSchemaUrl?: string | null
  sourceSchemaVersion?: string | null
}

let { family, sourceReleaseCode, sourceSchemaUrl, sourceSchemaVersion }: Props =
  $props()

let apiBaseUrl = $derived(
  (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, ''),
)
let requestUrl = $derived(
  `${apiBaseUrl}/${family}/v0.1/sources?sourceRelease=${encodeURIComponent(sourceReleaseCode)}&include=geometry`,
)
</script>

<section class="space-y-4" aria-label="Source record schema">
  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    Each source record preserves the source payload in <code>rawProperties</code>. Its
    keys and value types follow this release's upstream source schema; SaanSeoi does not
    normalise or omit those stored raw fields.
  </p>

  <dl
    class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
  >
    <div class="grid grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 px-4 py-4">
      <dt class="font-mono text-label-md font-semibold text-primary">sourceRecordId</dt>
      <dd class="font-body text-body-md text-foreground-alt">
        string — source-specific record identifier
      </dd>
    </div>
    <div
      class="grid grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant/55 px-4 py-4"
    >
      <dt class="font-mono text-label-md font-semibold text-primary">resourceType</dt>
      <dd class="font-body text-body-md text-foreground-alt">
        string — SaanSeoi resource type represented by the source record
      </dd>
    </div>
    <div
      class="grid grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant/55 px-4 py-4"
    >
      <dt class="font-mono text-label-md font-semibold text-primary">variant</dt>
      <dd class="font-body text-body-md text-foreground-alt">
        string — source variant retained with the record
      </dd>
    </div>
    <div
      class="grid grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant/55 px-4 py-4"
    >
      <dt class="font-mono text-label-md font-semibold text-primary">rawProperties</dt>
      <dd class="font-body text-body-md text-foreground-alt">
        object or null — exact raw fields stored for this release
      </dd>
    </div>
    <div
      class="grid grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant/55 px-4 py-4"
    >
      <dt class="font-mono text-label-md font-semibold text-primary">geometry</dt>
      <dd class="font-body text-body-md text-foreground-alt">
        optional GeoJSON geometry, included with <code>include=geometry</code>
      </dd>
    </div>
  </dl>

  <p class="font-body text-body-md text-foreground-alt">
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href={requestUrl}
      target="_blank"
      rel="noreferrer"
      >Open the source-record response</a
    >.
    {#if sourceSchemaUrl}
      The upstream schema{sourceSchemaVersion ? ` (${sourceSchemaVersion})` : ''}
      is
      <a
        class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
        href={sourceSchemaUrl}
        target="_blank"
        rel="noreferrer"
        >also available</a
      >.
    {/if}
  </p>
</section>
