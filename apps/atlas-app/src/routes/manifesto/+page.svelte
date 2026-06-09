<script lang="ts">
import ManifestoPage from '$lib/bits/pages/manifesto/page.svelte'
import { m } from '$lib/bits/internal/i18n'

const sections = [
  'Dropping Anchor',
  'Values',
  'Values',
  'Mission',
  'Values',
  'Values',
  'Values',
  'Practice',
  'Practice',
  'Practice',
  'Practice',
  'Commitment',
  'Hop aboard',
] as const

const principles = [
  { number: '01', lead: () => m.manifesto_1_lead(), body: () => m.manifesto_1_body() },
  { number: '02', lead: () => m.manifesto_2_lead(), body: () => m.manifesto_2_body() },
  { number: '03', lead: () => m.manifesto_3_lead(), body: () => m.manifesto_3_body() },
  { number: '04', lead: () => m.manifesto_4_lead(), body: () => m.manifesto_4_body() },
  { number: '05', lead: () => m.manifesto_5_lead(), body: () => m.manifesto_5_body() },
  { number: '06', lead: () => m.manifesto_6_lead(), body: () => m.manifesto_6_body() },
  { number: '07', lead: () => m.manifesto_7_lead(), body: () => m.manifesto_7_body() },
  { number: '08', lead: () => m.manifesto_8_lead(), body: () => m.manifesto_8_body() },
  { number: '09', lead: () => m.manifesto_9_lead(), body: () => m.manifesto_9_body() },
  {
    number: '10',
    lead: () => m.manifesto_10_lead(),
    body: () => m.manifesto_10_body(),
  },
  {
    number: '11',
    lead: () => m.manifesto_11_lead(),
    body: () => m.manifesto_11_body(),
  },
  {
    number: '12',
    lead: () => m.manifesto_12_lead(),
    body: () => m.manifesto_12_body(),
  },
  {
    number: '13',
    lead: () => m.manifesto_13_lead(),
    body: () => m.manifesto_13_body(),
  },
].map((principle, index) => ({
  number: principle.number,
  section: sections[index]!,
  lead: principle.lead(),
  body: principle.body(),
}))

const subtitle =
  'Thirteen principles to honour the social fabric, memory, and future of our city.'
const badge = 'Document Ref: SS-2026-MANIFESTO.01 // 2026-06-15'
</script>

<svelte:head>
  <title>A Manifesto for the Digital Commons | {m.saanseoi()}</title>
  <meta name="description" content={subtitle}>
</svelte:head>

<ManifestoPage
  {principles}
  {subtitle}
  {badge}
  ctaPrimary={m.hero_cta_primary()}
  ctaSecondary={m.hero_cta_secondary()}
/>
