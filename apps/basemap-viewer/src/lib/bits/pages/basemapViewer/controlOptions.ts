import type { Region } from '../../../catalogue'
import type { AppState, FeatureKey, LabelKey } from '../../../types'
import {
  featureTextKey,
  features,
  labelTextKeys,
  labels,
  type ViewerText,
} from './i18n'

export type ViewerLayerItem = {
  checked: boolean
  disabled: boolean
  key: string
  label: string
}

export function layerItems(
  state: AppState,
  enabled: boolean,
  text: ViewerText,
  labelStyle: keyof typeof labelTextKeys = 'detailed',
): { features: readonly ViewerLayerItem[]; labels: readonly ViewerLayerItem[] } {
  return {
    features: features.map(key => ({
      checked: state.features[key],
      disabled: !enabled,
      key,
      label: text[featureTextKey[key]],
    })),
    labels: labels.map(key => ({
      checked: state.labels[key],
      disabled:
        !enabled ||
        (key === 'roads' && !state.features.roads) ||
        (key === 'pois' && !state.features.pois),
      key,
      label: text[labelTextKeys[labelStyle][key]],
    })),
  }
}

export function releaseOptions(
  versions: readonly string[],
  text: { latest: string },
): { label: string; value: string }[] {
  return [
    { value: 'latest', label: text.latest },
    ...versions.map(version => ({ value: version, label: version })),
  ]
}

export function comparisonReleaseOptions(
  versions: readonly string[],
  text: { latest: string; noComparison: string },
): { label: string; value: string }[] {
  return [{ value: 'off', label: text.noComparison }, ...releaseOptions(versions, text)]
}

const regionTextKeys: Partial<Record<string, keyof ViewerText>> = {
  gba: 'greaterBayArea',
  hk: 'hongKong',
  mo: 'macao',
}

export function regionLabel(
  region: Region,
  text: ViewerText,
  localised = false,
): string {
  const textKey = localised ? regionTextKeys[region.code] : undefined
  return textKey ? text[textKey] : (region.label ?? region.description)
}

export function regionOptions(
  regions: readonly Region[],
  text: ViewerText,
  localised = false,
): { label: string; value: string }[] {
  return regions.map(region => ({
    value: region.code,
    label: regionLabel(region, text, localised),
  }))
}

export function asFeatureKey(key: string): FeatureKey {
  return key as FeatureKey
}

export function asLabelKey(key: string): LabelKey {
  return key as LabelKey
}
