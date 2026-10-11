<script lang="ts">
let { field }: { field: string } = $props()
const colours = [
  'bg-data-primary/15 text-data-primary',
  'bg-data-secondary/15 text-data-secondary',
  'bg-data-tertiary/15 text-data-tertiary',
]
// Stable pseudo-random assignment keeps each field recognisable across records and reloads.
const colour = $derived(
  colours[
    Array.from(field).reduce(
      (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0,
      0,
    ) % colours.length
  ],
)
</script>

<span class={`rounded px-2 py-0.5 font-mono text-caption ${colour}`}>{field}</span>
