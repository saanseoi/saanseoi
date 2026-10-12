import { getContext, setContext } from 'svelte'
import type { ProvenanceSource } from '#lib/registry/provenanceSources.js'
const key = Symbol('provenance sources')
export const provideProvenanceSources = (
  read: () => Record<string, ProvenanceSource[]>,
) => setContext(key, read)
export const useProvenanceSources = () =>
  getContext<() => Record<string, ProvenanceSource[]>>(key) ?? (() => ({}))
