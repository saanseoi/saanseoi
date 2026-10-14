import type { applyDivisionClassificationPatch } from './divisionClassificationPatch'
import type { applyCuratedDivisionNames } from './curatedDivisionPolicy'

/** Apply only the name outputs declared by a patch, after ordinary curation. */
export function applyDivisionNamePatch(
  id: string,
  names: ReturnType<typeof applyCuratedDivisionNames>,
  patch: ReturnType<typeof applyDivisionClassificationPatch>,
) {
  const i18n = structuredClone(names)
  if (patch?.nameEn || patch?.nameAltsEn || patch?.nameAltsZhHant) {
    const english = i18n.find(entry => entry.locale === 'en')
    if (english) {
      if (patch.nameEn) english.name = patch.nameEn
      const nameAlts = [
        ...(english.nameAlts?.split('|').filter(Boolean) ?? []),
        ...(patch.nameAltsEn ?? []),
      ].filter(name => name !== english.name)
      const dedupedNameAlts = [...new Set(nameAlts)]
      english.nameAlts = dedupedNameAlts.length > 0 ? dedupedNameAlts.join('|') : null
      english.nameVariant = [...(english.nameVariant ?? []), ...dedupedNameAlts].filter(
        (name, index, values) => values.indexOf(name) === index,
      )
    } else if (patch.nameEn || patch.nameAltsEn)
      i18n.push({
        divisionId: id,
        locale: 'en',
        name: patch.nameEn ?? null,
        nameAlts: patch.nameAltsEn?.join('|') ?? null,
        nameRules: null,
        nameVariant: [
          ...(patch.nameEn ? [patch.nameEn] : []),
          ...(patch.nameAltsEn ?? []),
        ],
        meta: { isLocaleInferred: false },
      })
    let zhHant = i18n.find(entry => entry.locale === 'zh-hant')
    if (!zhHant && patch.nameAltsZhHant) {
      zhHant = {
        divisionId: id,
        locale: 'zh-hant',
        name: null,
        nameAlts: null,
        nameRules: null,
        nameVariant: null,
        meta: { isLocaleInferred: false },
      }
      i18n.push(zhHant)
    }
    if (zhHant && patch.nameAltsZhHant) {
      const nameAlts = [
        ...(zhHant.nameAlts?.split('|').filter(Boolean) ?? []),
        ...patch.nameAltsZhHant,
      ].filter(name => name !== zhHant.name)
      const dedupedNameAlts = [...new Set(nameAlts)]
      zhHant.nameAlts = dedupedNameAlts.length > 0 ? dedupedNameAlts.join('|') : null
      zhHant.nameVariant = [...(zhHant.nameVariant ?? []), ...dedupedNameAlts].filter(
        (name, index, values) => values.indexOf(name) === index,
      )
    }
  }
  return i18n
}
