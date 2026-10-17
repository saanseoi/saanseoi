import { placeDivisionFieldNames } from '@repo/db'

/** Derived display content from the single Division snapshot selected by a Place publication. */
export function placeDivisionDefinitionsSql(place = 'places') {
  const ids = placeDivisionFieldNames.map(field => `${place}."${field}"`).join(',')
  return `(SELECT json_group_object(d.id,json_object('divisionSnapshotId',pp.divisionSnapshotId,'level',d.level,'locales',json((SELECT json_group_array(json_object('locale',l.locale,'name',l.name)) FROM (SELECT locale,name FROM divisionsI18n WHERE scopeId=d.scopeId AND divisionId=d.id ORDER BY locale) l))))
    FROM placePublicationState pp JOIN divisionPublicationState dp ON dp.snapshotId=pp.divisionSnapshotId AND dp.preparedAt IS NOT NULL
    JOIN divisions d ON d.scopeId=dp.scopeId WHERE pp.scopeId=${place}.scopeId AND d.id IN (${ids}))`
}

export function placeAddressSnapshotSql(place = 'places') {
  return `(SELECT CASE ${place}.addressRole WHEN 'address' THEN pp.addressSnapshotId WHEN 'supplementaryAddress' THEN pp.supplementaryAddressSnapshotId END FROM placePublicationState pp WHERE pp.scopeId=${place}.scopeId)`
}
