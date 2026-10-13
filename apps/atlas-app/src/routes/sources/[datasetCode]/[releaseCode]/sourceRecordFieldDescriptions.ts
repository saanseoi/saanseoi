/** Publisher field meanings keyed by retained property names; the schema supplies types and nullability. */
const planningUnitFields: Record<string, string> = {
  ppu: 'Primary planning unit code. Identifies the primary planning unit containing this source cell.',
  spu: 'Secondary planning unit code. Identifies the secondary planning unit within the primary planning unit containing this source cell.',
  tpu: 'Tertiary planning unit code. Identifies the tertiary planning unit within the secondary planning unit containing this source cell.',
  subunit:
    'Subunit code. Identifies the subunit within the tertiary planning unit containing this source cell.',
  sbVc: 'Subunit or village cluster code within the tertiary planning unit containing this source cell.',
}

// Meanings are scoped to the publisher dataset: identical field names in other
// datasets do not imply an identical definition. Types still come from retained rows.
// References: docs/datasets/sources/hkgov-had/divisionArea.md,
// hkgov-landsd/placeName.md and hkgov-hyd/streetNamePlate.md.
const datasetFields: Record<string, Record<string, string>> = {
  // C&SD simplified data specification, BG_21C and HMA_21C:
  // https://static.csdi.gov.hk/csdi-webpage/view/common/59db8193e184a4188049df9af8b5fdacab11411382f0caca323d6962d968ae6a
  'hkgov-censtatd-division-statistic-housing-market-areas-building-groups': {
    bg: 'Publisher building group code.',
    bgZhHant: 'Building group name in Traditional Chinese.',
    bgEn: 'Building group name in English.',
    bgInd:
      'Building group indicator: B represents building groups; O represents records of other buildings in the area.',
    hma: 'Publisher housing market area code.',
    hmaZhHant: 'Housing market area name in Traditional Chinese.',
    hmaEn: 'Housing market area name in English.',
  },
  // C&SD simplified data specification, DC_21C_SDU:
  // https://static.csdi.gov.hk/csdi-webpage/view/common/687dacd3427eeddea2d6f8ebfa47a599e47a86e87421205ffddf42d677f38e54
  'hkgov-censtatd-division-statistic-subdivided-units-district': {
    objectId: 'Publisher feature object identifier.',
    shapeArea: 'Area calculated in the publisher’s source coordinate system.',
    shapeLength:
      'Boundary length calculated in the publisher’s source coordinate system.',
    dc: 'Publisher District Council district code.',
    dcZhHant: 'District Council district name in Traditional Chinese.',
    dcClass: 'Publisher classification of the District Council district.',
    dcEn: 'District Council district name in English.',
    sduDh: 'Number of domestic households living in subdivided units.',
    sduN: 'Number of occupied subdivided units.',
    sduOq: 'Number of occupied quarters with subdivided units.',
    sduPop: 'Number of persons living in subdivided units.',
  },
  'hkgov-censtatd-division-statistic-permanent-living-quarters': {
    areaZhHant: 'Geographic area name in Traditional Chinese.',
    areaEn:
      'Geographic area name in English: Hong Kong Island, Kowloon or New Territories.',
    period:
      'Publisher reference period for the living-quarters figures, retained as text.',
    qtrAll:
      'Total permanent living quarters across public rental housing, subsidised sale flats and private housing in the area.',
    qtrPrh: 'Permanent living quarters in public rental housing in the area.',
    qtrPrhHa:
      'Public rental housing quarters provided by the Hong Kong Housing Authority.',
    qtrPrhHs:
      'Public rental housing quarters provided by the Hong Kong Housing Society.',
    qtrSsf:
      'Permanent living quarters classified as subsidised sale flats in the area.',
    qtrSsfHa: 'Subsidised sale flats provided by the Hong Kong Housing Authority.',
    qtrSsfHs: 'Subsidised sale flats provided by the Hong Kong Housing Society.',
    qtrSsfUra: 'Subsidised sale flats provided by the Urban Renewal Authority.',
    qtrPh: 'Permanent living quarters classified as private housing in the area.',
    qtrPhPrf: 'Private housing quarters classified as private residential flats.',
    qtrPhVbm:
      'Private housing quarters classified as villas, bungalows or modern village houses.',
    qtrPhSstv:
      'Private housing quarters classified as simple stone structures or traditional village houses.',
    qtrPhSq: 'Private housing quarters classified as staff quarters.',
    qtrPhNdq: 'Private housing quarters classified as non-domestic quarters.',
  },
  'hkgov-pland-division-new-town': {
    newTownEn: 'Publisher New Town name in English.',
    newTownZhHant: 'Publisher New Town name in Traditional Chinese.',
    newTownZhHans: 'Publisher New Town name in Simplified Chinese.',
  },
  'hkgov-landsd-road-centreline': {
    streetcode:
      'Publisher street code for the road segment. Text codes retain leading zeroes.',
    objectId: 'Publisher road segment object identifier.',
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
    areaCode: 'Publisher district area code, used to resolve the associated district.',
    areaId: 'Publisher identifier for the district area.',
    areaType: 'Publisher classification of the administrative area.',
    csdiAdminAreaId: 'CSDI administrative area identifier.',
    objectId: 'Publisher feature object identifier.',
    nameZhHant: 'District name in Traditional Chinese.',
    nameEn: 'District name in English.',
    dataOwner: 'Organisation responsible for the publisher record.',
    beginLifespan: 'Start of the publisher record’s validity period.',
    endLifespan:
      'End of the publisher record’s validity period; an open value indicates no specified end.',
    shapeLength:
      'Boundary length calculated in the publisher’s source coordinate system.',
    shapeArea: 'Area calculated in the publisher’s source coordinate system.',
  },
  'hkgov-landsd-division': {
    geoNameId: 'Publisher geographic name identifier.',
    placeClass:
      'Broad publisher feature class: Settlement, Hydrographic or Topographic.',
    placeType: 'Publisher classification of the named geographic feature.',
    district: 'Publisher district attribution for the named geographic feature.',
  },
  'hkgov-hyd-street': {
    snpId: 'Publisher street name plate identifier.',
    roadName: 'Street name displayed on the name plate.',
    lvl: 'Publisher level classification for the street name plate.',
  },
  'hkgov-hyd-sensitive-street': {
    lvl: 'Publisher level classification for the street.',
    sectBtwn: 'Publisher description of the limits of the street section.',
    stEngnm: 'Street name in English.',
  },
  'hkgov-hyd-strategic-street': {
    lvl: 'Publisher level classification for the street.',
    sectBtwn: 'Publisher description of the limits of the street section.',
    stEngnm: 'Street name in English.',
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
