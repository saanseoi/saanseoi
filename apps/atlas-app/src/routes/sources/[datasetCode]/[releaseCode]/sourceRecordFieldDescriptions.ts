/** Publisher field meanings; the retained schema supplies types and nullability. */
const planningUnitFields: Record<string, string> = {
  PPU: 'Primary planning unit code. Identifies the primary planning unit containing this source cell.',
  SPU: 'Secondary planning unit code. Identifies the secondary planning unit within the primary planning unit containing this source cell.',
  TPU: 'Tertiary planning unit code. Identifies the tertiary planning unit within the secondary planning unit containing this source cell.',
  Subunit:
    'Subunit code. Identifies the subunit within the tertiary planning unit containing this source cell.',
  SB_VC:
    'Subunit or village cluster code within the tertiary planning unit containing this source cell.',
}

// Meanings are scoped to the publisher dataset: identical field names in other
// datasets do not imply an identical definition. Types still come from retained rows.
// References: docs/datasets/sources/hkgov-had/divisionArea.md,
// hkgov-landsd/placeName.md and hkgov-hyd/streetNamePlate.md.
const datasetFields: Record<string, Record<string, string>> = {
  'hkgov-censtatd-division-statistic-permanent-living-quarters': {
    AREA_CHI: 'Geographic area name in Traditional Chinese.',
    AREA_ENG:
      'Geographic area name in English: Hong Kong Island, Kowloon or New Territories.',
    PERIOD:
      'Publisher reference period for the living-quarters figures, retained as text.',
    QTR_ALL:
      'Total permanent living quarters across public rental housing, subsidised sale flats and private housing in the area.',
    QTR_PRH: 'Permanent living quarters in public rental housing in the area.',
    QTR_PRH_HA:
      'Public rental housing quarters provided by the Hong Kong Housing Authority.',
    QTR_PRH_HS:
      'Public rental housing quarters provided by the Hong Kong Housing Society.',
    QTR_SSF:
      'Permanent living quarters classified as subsidised sale flats in the area.',
    QTR_SSF_HA: 'Subsidised sale flats provided by the Hong Kong Housing Authority.',
    QTR_SSF_HS: 'Subsidised sale flats provided by the Hong Kong Housing Society.',
    QTR_SSF_URA: 'Subsidised sale flats provided by the Urban Renewal Authority.',
    QTR_PH: 'Permanent living quarters classified as private housing in the area.',
    QTR_PH_PRF: 'Private housing quarters classified as private residential flats.',
    QTR_PH_VBM:
      'Private housing quarters classified as villas, bungalows or modern village houses.',
    QTR_PH_SSTV:
      'Private housing quarters classified as simple stone structures or traditional village houses.',
    QTR_PH_SQ: 'Private housing quarters classified as staff quarters.',
    QTR_PH_NDQ: 'Private housing quarters classified as non-domestic quarters.',
  },
  'hkgov-pland-division-new-town': {
    NewTown_en: 'Publisher New Town name in English.',
    NewTown_Tc: 'Publisher New Town name in Traditional Chinese.',
    NewTown_Sc: 'Publisher New Town name in Simplified Chinese.',
  },
  'hkgov-landsd-road-centreline': {
    STREETCODE:
      'Publisher street code for the road segment. Text codes retain leading zeroes.',
    OBJECTID: 'Publisher road segment object identifier.',
  },
  'hkgov-landsd-street': {
    nameEn: 'Street name in English retained from the publisher document.',
    nameZhHant:
      'Street name in Traditional Chinese retained from the publisher document.',
    districtCode: 'Publisher district code for the baseline street record.',
    districtCodes: 'Publisher district codes associated with the notice.',
    descriptionEn: 'English description of the street in the notice.',
    descriptionZhHant: 'Traditional Chinese description of the street in the notice.',
    gazetteDate: 'Publication date of the Gazette notice.',
    effectiveDate: 'Date on which the notice takes effect.',
    kind: 'Classification of the street notice.',
    noticeRef: 'Reference identifying the Gazette notice.',
    previousNoticeRefs: 'References to earlier notices cited by this notice.',
    rawExtractedText: 'Text extracted from the publisher document.',
    parserDiagnostics: 'Diagnostics retained from extraction of the document.',
    evidenceAssets: 'Source document assets supporting the extracted record.',
  },
  'hkgov-had-division-area-district': {
    AREA_CODE: 'Publisher district area code, used to resolve the associated district.',
    AREA_ID: 'Publisher identifier for the district area.',
    AREA_TYPE: 'Publisher classification of the administrative area.',
    CSDI_ADMIN_AREA_ID: 'CSDI administrative area identifier.',
    OBJECTID: 'Publisher feature object identifier.',
    NAME_TC: 'District name in Traditional Chinese.',
    NAME_EN: 'District name in English.',
    DATA_OWNER: 'Organisation responsible for the publisher record.',
    BEGIN_LIFESPAN: 'Start of the publisher record’s validity period.',
    END_LIFESPAN:
      'End of the publisher record’s validity period; an open value indicates no specified end.',
    SHAPE_Length:
      'Boundary length calculated in the publisher’s source coordinate system.',
    SHAPE_Area: 'Area calculated in the publisher’s source coordinate system.',
  },
  'hkgov-landsd-division': {
    GEO_NAME_ID: 'Publisher geographic name identifier.',
    PLACE_CLASS:
      'Broad publisher feature class: Settlement, Hydrographic or Topographic.',
    PLACE_TYPE: 'Publisher classification of the named geographic feature.',
    DISTRICT: 'Publisher district attribution for the named geographic feature.',
  },
  'hkgov-hyd-street': {
    SNP_ID: 'Publisher street name plate identifier.',
    ROAD_NAME: 'Street name displayed on the name plate.',
    LVL: 'Publisher level classification for the street name plate.',
  },
  'hkgov-hyd-sensitive-street': {
    LVL: 'Publisher level classification for the street.',
    SECT_BTWN: 'Publisher description of the limits of the street section.',
    ST_ENGNM: 'Street name in English.',
  },
  'hkgov-hyd-strategic-street': {
    LVL: 'Publisher level classification for the street.',
    SECT_BTWN: 'Publisher description of the limits of the street section.',
    ST_ENGNM: 'Street name in English.',
  },
}

export function sourceRecordFieldDescription(
  sourceReleaseCode: string,
  field: string,
): string | undefined {
  for (const [dataset, fields] of Object.entries(datasetFields)) {
    if (
      sourceReleaseCode.startsWith(`dr-hk-${dataset}-`) &&
      /^\d/.test(sourceReleaseCode.slice(`dr-hk-${dataset}-`.length))
    ) {
      return fields[field]
    }
  }
  if (
    /^dr-hk-hkgov-pland-division(?:-area)?-pu-(?:2001|2006|2011|2016|2021)$/.test(
      sourceReleaseCode,
    )
  ) {
    return planningUnitFields[field]
  }
  return undefined
}
