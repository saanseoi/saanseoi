<script lang="ts">
let {
  kind,
}: {
  kind:
    | 'approval'
    | 'production'
    | 'skip'
    | 'queue'
    | 'close'
    | 'previous'
    | 'next'
    | 'refresh'
} = $props()
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="size-6"
  aria-hidden="true"
>
  {#if kind === 'approval'}
    <path d="M5 17h14l1 4H4l1-4Zm2-3v3m10-3v3M7 14h10l-2-5V6a3 3 0 0 0-6 0v3l-2 5Z" />
    <path d="m10.5 6 1 1 2-2M7 23h10" />
  {:else if kind === 'production'}
    <path
      d="M3 21V11l6-4v6l6-4v12H3Zm12 0V3h5l1 18M6 17h1m4 0h1m6-10h2m-2 4h2m-2 4h2"
    />
  {:else if kind === 'queue'}
    <path d="M8 5H5v16h14V5h-3M9 3h6v4H9V3Zm0 8h6m-6 4h6m-6 4h3" />
  {:else if kind === 'close'}
    <path d="m6 6 12 12M6 18 18 6" />
  {:else if kind === 'previous'}
    <path d="m14 6-6 6 6 6" />
  {:else if kind === 'next'}
    <path d="m10 6 6 6-6 6" />
  {:else if kind === 'refresh'}
    <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />
  {:else}
    <path d="m5 5 10 7L5 19V5Zm14 0v14" />
  {/if}
</svg>
