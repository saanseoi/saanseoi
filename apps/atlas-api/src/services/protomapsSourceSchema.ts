import type { saanseoiDivisionSourceFields } from './saanseoiDivisionSourceSchema'

/** Meanings of the extracted source fields; presence and nullability come from the release. */
export const protomapsSourceFields: typeof saanseoiDivisionSourceFields = {
  kind: {
    type: 'string',
    description:
      'Where this record comes from. `osm-island` is an OpenStreetMap island, islet or archipelago feature, which may be a point label or an outline. `coastline-land` is a complete land shape from the coastline data and can include mainland land. These records are source evidence, not a list of distinct islands.',
    enum: ['osm-island', 'coastline-land'],
  },
  names: {
    type: 'object',
    description:
      'Names derived from explicit OpenStreetMap `name:<language>` tags, keyed by language. Each value is a name supplied by the source, not a SaanSeoi translation. Any language key may be absent; an empty object means no language-tagged names were supplied. The untagged `name` remains in `tags` without assigning it a language.',
    properties: {
      en: { type: 'string', description: 'English name, from `name:en`.' },
      zh: {
        type: 'string',
        description:
          'Chinese name, from `name:zh`. The tag does not specify Traditional or Simplified Chinese.',
      },
      'zh-Hant': {
        type: 'string',
        description: 'Traditional Chinese name, from `name:zh-Hant`.',
      },
      'zh-Hans': {
        type: 'string',
        description: 'Simplified Chinese name, from `name:zh-Hans`.',
      },
      yue: {
        type: 'string',
        description:
          'Cantonese name, from `name:yue`. The tag does not specify a script.',
      },
      'yue-Hant': {
        type: 'string',
        description: 'Cantonese name in Traditional Chinese, from `name:yue-Hant`.',
      },
      'yue-Latn': {
        type: 'string',
        description: 'Cantonese name in Latin script, from `name:yue-Latn`.',
      },
    },
    'x-additionalPropertiesName': 'other language key',
    additionalProperties: {
      type: 'string',
      description:
        'A name in another language or writing system identified by its key, for example `ja` (Japanese) or `yue-Latn-jyutping` (Cantonese in Jyutping romanisation). Keys are not limited to the languages used by the SaanSeoi interface.',
    },
  },
  tags: {
    type: 'object',
    description:
      'Source attributes attached to the feature, including OpenStreetMap names, classifications and reference links where supplied. Keys use the retained source-record spelling. An empty object means the feature has no retained tags.',
    properties: {
      name: {
        type: 'string',
        description:
          'Name without an explicit language tag. Its language is not inferred.',
      },
      place: {
        type: 'string',
        description:
          'OpenStreetMap place classification, such as `island`, `islet` or `archipelago`.',
      },
    },
    'x-additionalPropertiesName': 'other tag key',
    additionalProperties: {
      type: 'string',
      description:
        'Source tag value. Tag availability varies between features; numeric-looking values remain text.',
    },
  },
}
