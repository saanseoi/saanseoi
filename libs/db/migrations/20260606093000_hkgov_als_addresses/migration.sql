PRAGMA foreign_keys = OFF;

CREATE TABLE `address2d__new` (
	`id` text PRIMARY KEY NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`geometryJson` text,
	`identifiersJson` text,
	`otStreet` text,
	`otNumber` text,
	`otBboxJson` text,
	`otVersion` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `fk_address2d_hamletId_divisions_id_fk` FOREIGN KEY (`hamletId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_microhoodId_divisions_id_fk` FOREIGN KEY (`microhoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_villageId_divisions_id_fk` FOREIGN KEY (`villageId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_neighbourhoodId_divisions_id_fk` FOREIGN KEY (`neighbourhoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_macrohoodId_divisions_id_fk` FOREIGN KEY (`macrohoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_townId_divisions_id_fk` FOREIGN KEY (`townId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_districtId_divisions_id_fk` FOREIGN KEY (`districtId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_areaId_divisions_id_fk` FOREIGN KEY (`areaId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_countryId_divisions_id_fk` FOREIGN KEY (`countryId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
INSERT INTO `address2d__new` (
	`id`,
	`streetId`,
	`microhoodId`,
	`neighbourhoodId`,
	`macrohoodId`,
	`districtId`,
	`areaId`,
	`countryId`,
	`geometryJson`,
	`otStreet`,
	`otNumber`,
	`otBboxJson`,
	`otVersion`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`id`,
	`streetId`,
	`microhoodId`,
	`neighbourhoodId`,
	`subDistrictId`,
	`districtId`,
	`regionId`,
	`countryId`,
	json_object('type', 'Point', 'coordinates', json_array(`otLng`, `otLat`)),
	`otStreet`,
	`otNumber`,
	`otBboxJson`,
	`otVersion`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
FROM `address2d`;
--> statement-breakpoint
DROP TABLE `address2d`;
--> statement-breakpoint
ALTER TABLE `address2d__new` RENAME TO `address2d`;
--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);
--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);
--> statement-breakpoint

CREATE TABLE `address2dVersions__new` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`geometryJson` text,
	`identifiersJson` text,
	`otStreet` text,
	`otNumber` text,
	`otBboxJson` text,
	`otVersion` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `address2dVersions__new` (
	`id`,
	`versionHash`,
	`validFromMonth`,
	`validToMonth`,
	`isCurrent`,
	`streetId`,
	`microhoodId`,
	`neighbourhoodId`,
	`macrohoodId`,
	`districtId`,
	`areaId`,
	`countryId`,
	`geometryJson`,
	`otStreet`,
	`otNumber`,
	`otBboxJson`,
	`otVersion`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`id`,
	`versionHash`,
	`validFromMonth`,
	`validToMonth`,
	`isCurrent`,
	`streetId`,
	`microhoodId`,
	`neighbourhoodId`,
	`subDistrictId`,
	`districtId`,
	`regionId`,
	`countryId`,
	json_object('type', 'Point', 'coordinates', json_array(`otLng`, `otLat`)),
	`otStreet`,
	`otNumber`,
	`otBboxJson`,
	`otVersion`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
FROM `address2dVersions`;
--> statement-breakpoint
CREATE TABLE `address2dVersionsDatasets` (
	`addressId` text NOT NULL,
	`versionHash` text NOT NULL,
	`datasetId` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dVersionsDatasets_pk` PRIMARY KEY(`addressId`, `versionHash`, `datasetId`),
	CONSTRAINT `fk_address2dVersionsDatasets_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
INSERT INTO `address2dVersionsDatasets` (
	`addressId`,
	`versionHash`,
	`datasetId`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`id`,
	`versionHash`,
	`datasetId`,
	`createdAt`,
	`updatedAt`
FROM `address2dVersions`;
--> statement-breakpoint
DROP TABLE `address2dVersions`;
--> statement-breakpoint
ALTER TABLE `address2dVersions__new` RENAME TO `address2dVersions`;
--> statement-breakpoint
CREATE INDEX `address2dVersions_current_lookup_idx` ON `address2dVersions` (`id`,`isCurrent`);
--> statement-breakpoint
CREATE INDEX `address2dVersions_validity_idx` ON `address2dVersions` (`validFromMonth`,`validToMonth`);
--> statement-breakpoint
CREATE INDEX `address2dVersionsDatasets_datasetId_idx` ON `address2dVersionsDatasets` (`datasetId`);
--> statement-breakpoint
CREATE INDEX `address2dVersionsDatasets_version_idx` ON `address2dVersionsDatasets` (`addressId`,`versionHash`);
--> statement-breakpoint

CREATE TABLE `address2dI18n__new` (
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`blockType` text,
	`blockNumber` text,
	`blockTypeBeforeNumber` integer,
	`phaseName` text,
	`phaseNumber` text,
	`estateName` text,
	`streetNumber` text,
	`streetName` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `locale`),
	CONSTRAINT `fk_address2dI18n_addressId_address2d_id_fk` FOREIGN KEY (`addressId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
INSERT INTO `address2dI18n__new` (
	`addressId`,
	`locale`,
	`formattedAddress`,
	`buildingName`,
	`buildingNumberFrom`,
	`buildingNumberTo`,
	`blockType`,
	`blockNumber`,
	`blockTypeBeforeNumber`,
	`phaseName`,
	`phaseNumber`,
	`estateName`,
	`streetNumber`,
	`streetName`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`addressId`,
	`locale`,
	`formattedAddress`,
	`buildingName`,
	`buildingNumberFrom`,
	`buildingNumberTo`,
	`blockType`,
	`blockNumber`,
	`blockTypeBeforeNumber`,
	`phaseName`,
	`phaseNumber`,
	`estateName`,
	`streetNumber`,
	`streetName`,
	`createdAt`,
	`updatedAt`
FROM `address2dI18n`;
--> statement-breakpoint
DROP TABLE `address2dI18n`;
--> statement-breakpoint
ALTER TABLE `address2dI18n__new` RENAME TO `address2dI18n`;
--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);
--> statement-breakpoint

CREATE TABLE `address2dVersionsI18n__new` (
	`addressId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`blockType` text,
	`blockNumber` text,
	`blockTypeBeforeNumber` integer,
	`phaseName` text,
	`phaseNumber` text,
	`estateName` text,
	`streetNumber` text,
	`streetName` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dVersionsI18n_pk` PRIMARY KEY(`addressId`, `versionHash`, `locale`)
);
--> statement-breakpoint
INSERT INTO `address2dVersionsI18n__new` (
	`addressId`,
	`versionHash`,
	`locale`,
	`formattedAddress`,
	`buildingName`,
	`buildingNumberFrom`,
	`buildingNumberTo`,
	`blockType`,
	`blockNumber`,
	`blockTypeBeforeNumber`,
	`phaseName`,
	`phaseNumber`,
	`estateName`,
	`streetNumber`,
	`streetName`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`addressId`,
	`versionHash`,
	`locale`,
	`formattedAddress`,
	`buildingName`,
	`buildingNumberFrom`,
	`buildingNumberTo`,
	`blockType`,
	`blockNumber`,
	`blockTypeBeforeNumber`,
	`phaseName`,
	`phaseNumber`,
	`estateName`,
	`streetNumber`,
	`streetName`,
	`createdAt`,
	`updatedAt`
FROM `address2dVersionsI18n`;
--> statement-breakpoint
DROP TABLE `address2dVersionsI18n`;
--> statement-breakpoint
ALTER TABLE `address2dVersionsI18n__new` RENAME TO `address2dVersionsI18n`;
--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_locale_idx` ON `address2dVersionsI18n` (`locale`);
--> statement-breakpoint

CREATE TABLE `address3dI18n__new` (
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `locale`),
	CONSTRAINT `fk_address3dI18n_address3dId_address3d_id_fk` FOREIGN KEY (`address3dId`) REFERENCES `address3d`(`id`)
);
--> statement-breakpoint
INSERT INTO `address3dI18n__new` (
	`address3dId`,
	`locale`,
	`formattedAddressPart`,
	`accessHint`,
	`unitPortion`,
	`unitNumber`,
	`unitType`,
	`floorNumber`,
	`floorType`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`address3dId`,
	`locale`,
	`formattedAddressPart`,
	`accessHint`,
	`unitPortion`,
	`unitNumber`,
	`unitType`,
	`floorNumber`,
	`floorType`,
	`createdAt`,
	`updatedAt`
FROM `address3dI18n`;
--> statement-breakpoint
DROP TABLE `address3dI18n`;
--> statement-breakpoint
ALTER TABLE `address3dI18n__new` RENAME TO `address3dI18n`;
--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);
--> statement-breakpoint

CREATE TABLE `address3dVersionsI18n__new` (
	`address3dId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address3dVersionsI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
INSERT INTO `address3dVersionsI18n__new` (
	`address3dId`,
	`versionHash`,
	`locale`,
	`formattedAddressPart`,
	`accessHint`,
	`unitPortion`,
	`unitNumber`,
	`unitType`,
	`floorNumber`,
	`floorType`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`address3dId`,
	`versionHash`,
	`locale`,
	`formattedAddressPart`,
	`accessHint`,
	`unitPortion`,
	`unitNumber`,
	`unitType`,
	`floorNumber`,
	`floorType`,
	`createdAt`,
	`updatedAt`
FROM `address3dVersionsI18n`;
--> statement-breakpoint
DROP TABLE `address3dVersionsI18n`;
--> statement-breakpoint
ALTER TABLE `address3dVersionsI18n__new` RENAME TO `address3dVersionsI18n`;
--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_locale_idx` ON `address3dVersionsI18n` (`locale`);
--> statement-breakpoint

INSERT OR IGNORE INTO `datasets` (
	`datasetId`,
	`regionCode`,
	`snapshotMonth`,
	`theme`,
	`type`,
	`source`,
	`sourceVersion`,
	`rawObjectKey`,
	`originalFileName`,
	`status`,
	`supersedesDatasetId`,
	`revokedAt`,
	`revocationReason`,
	`ingestedAt`,
	`createdAt`,
	`updatedAt`
) VALUES (
	'saanseoi-cn-2026-01-01.01-division',
	'cn',
	'2026-01',
	'divisions',
	'division',
	'saanseoi',
	'2026-01-01.01',
	'seed/saanseoi/2026-01-01.01/china-prc.json',
	'china-prc.json',
	'current',
	NULL,
	NULL,
	NULL,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `divisions` (
	`id`,
	`level`,
	`type`,
	`otGeometryJson`,
	`otPopulation`,
	`otVersion`,
	`otSubtype`,
	`otClass`,
	`otWikidata`,
	`otHierarchyJson`,
	`hierarchyJson`,
	`parentDivisionId`,
	`otCartographyJson`,
	`otBboxJson`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
) VALUES (
	'saanseoi-cn-prc',
	0,
	'country',
	NULL,
	NULL,
	'2026-01-01.01',
	'country',
	'administrative',
	'Q148',
	'[{"id":"saanseoi-cn-prc","level":0,"type":"country"}]',
	'[{"id":"saanseoi-cn-prc","level":0,"type":"country"}]',
	NULL,
	NULL,
	NULL,
	'{"saanseoi":[{"dataset":"OpenStreetMap","record_id":"relation/270056","boundary":"administrative","admin_level":"2","ISO3166-1":"CN","ISO3166-1:alpha2":"CN","ISO3166-1:alpha3":"CHN","ISO3166-1:numeric":"156","int_name":"China","name":"中国","name:en":"China","name:zh-Hant":"中國","alt_name:en":"P.R. China"}]}',
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `divisionsI18n` (
	`divisionId`,
	`locale`,
	`otName`,
	`otNameVariantJson`,
	`otNameAlts`,
	`otNameRulesJson`,
	`otLocalType`,
	`isLocaleInferred`,
	`createdAt`,
	`updatedAt`
) VALUES
(
	'saanseoi-cn-prc',
	'en',
	'China',
	'["China","P.R. China"]',
	'P.R. China',
	NULL,
	'country',
	0,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
),
(
	'saanseoi-cn-prc',
	'zh-hant',
	'中國',
	'["中國"]',
	NULL,
	NULL,
	'國家',
	0,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `divisionsVersions` (
	`id`,
	`versionHash`,
	`regionCode`,
	`datasetId`,
	`validFromMonth`,
	`validToMonth`,
	`isCurrent`,
	`level`,
	`type`,
	`otGeometryJson`,
	`otPopulation`,
	`otVersion`,
	`otVersionHash`,
	`otSubtype`,
	`otClass`,
	`otWikidata`,
	`otHierarchyJson`,
	`hierarchyJson`,
	`parentDivisionId`,
	`otCartographyJson`,
	`otBboxJson`,
	`sourcesJson`,
	`createdAt`,
	`updatedAt`
) VALUES (
	'saanseoi-cn-prc',
	'0fe97038d498efa822abf298d0aa1d4be7be4baf1cb67693b596f4db3af7f79a',
	'cn',
	'saanseoi-cn-2026-01-01.01-division',
	'2026-01',
	NULL,
	1,
	0,
	'country',
	NULL,
	NULL,
	'2026-01-01.01',
	'0fe97038d498efa822abf298d0aa1d4be7be4baf1cb67693b596f4db3af7f79a',
	'country',
	'administrative',
	'Q148',
	'[{"id":"saanseoi-cn-prc","level":0,"type":"country"}]',
	'[{"id":"saanseoi-cn-prc","level":0,"type":"country"}]',
	NULL,
	NULL,
	NULL,
	'{"saanseoi":[{"dataset":"OpenStreetMap","record_id":"relation/270056","boundary":"administrative","admin_level":"2","ISO3166-1":"CN","ISO3166-1:alpha2":"CN","ISO3166-1:alpha3":"CHN","ISO3166-1:numeric":"156","int_name":"China","name":"中国","name:en":"China","name:zh-Hant":"中國","alt_name:en":"P.R. China"}]}',
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `divisionsVersionsI18n` (
	`divisionId`,
	`versionHash`,
	`locale`,
	`otName`,
	`otNameVariantJson`,
	`otNameAlts`,
	`otNameRulesJson`,
	`otLocalType`,
	`isLocaleInferred`,
	`createdAt`,
	`updatedAt`
) VALUES
(
	'saanseoi-cn-prc',
	'0fe97038d498efa822abf298d0aa1d4be7be4baf1cb67693b596f4db3af7f79a',
	'en',
	'China',
	'["China","P.R. China"]',
	'P.R. China',
	NULL,
	'country',
	0,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
),
(
	'saanseoi-cn-prc',
	'0fe97038d498efa822abf298d0aa1d4be7be4baf1cb67693b596f4db3af7f79a',
	'zh-hant',
	'中國',
	'["中國"]',
	NULL,
	NULL,
	'國家',
	0,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
