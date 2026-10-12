import { getContext, setContext } from 'svelte'
import type { ProvenanceSource } from '#lib/registry/provenanceSources.js'
const key = Symbol('provenance sources')
export const provideProvenanceSources = (
  read: () => Record<string, ProvenanceSource[]>,
) => setContext(key, read)
export const useProvenanceSources = () =>
  getContext<() => Record<string, ProvenanceSource[]>>(key) ?? (() => ({}))

type FieldNavigation = {
  target: (name: string, resourceType?: string) => string | undefined
  select: (terminalNode: string) => void
}
const navigationKey = Symbol('provenance field navigation')
export const provideFieldNavigation = (navigation: FieldNavigation) =>
  setContext(navigationKey, navigation)
export const useFieldNavigation = () =>
  getContext<FieldNavigation | undefined>(navigationKey)
