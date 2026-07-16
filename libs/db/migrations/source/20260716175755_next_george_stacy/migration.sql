CREATE TABLE `hkgovPlandDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`divisionId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`sourceCellIds` text NOT NULL,
	`repairedSourceFeatureIds` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisions` (
	`sourceRecordId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`ppuCode` text NOT NULL,
	`spuCode` text,
	`tpuCode` text,
	`subunitCode` text,
	`sourceCellIds` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreaI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandNewTownDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`divisionId` text NOT NULL,
	`newTownId` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandNewTownDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`ppuCode` text NOT NULL,
	`spuCode` text NOT NULL,
	`tpuCode` text NOT NULL,
	`subunitCode` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_releaseId_idx` ON `hkgovPlandDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_sourceRecordId_idx` ON `hkgovPlandDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_current_lookup_idx` ON `hkgovPlandDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_release_validity_idx` ON `hkgovPlandDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_divisionId_idx` ON `hkgovPlandDivisionAreas` (`divisionId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_planningLevel_idx` ON `hkgovPlandDivisionAreas` (`planningLevel`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_releaseId_idx` ON `hkgovPlandDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_sourceRecordId_idx` ON `hkgovPlandDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_current_lookup_idx` ON `hkgovPlandDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_release_validity_idx` ON `hkgovPlandDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_planningLevel_idx` ON `hkgovPlandDivisions` (`planningLevel`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_tpuCode_idx` ON `hkgovPlandDivisions` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_releaseId_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_sourceRecordId_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_current_lookup_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_release_validity_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_locale_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_releaseId_idx` ON `hkgovPlandNewTownDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_sourceRecordId_idx` ON `hkgovPlandNewTownDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_current_lookup_idx` ON `hkgovPlandNewTownDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_release_validity_idx` ON `hkgovPlandNewTownDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_divisionId_idx` ON `hkgovPlandNewTownDivisionAreas` (`divisionId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_newTownId_idx` ON `hkgovPlandNewTownDivisionAreas` (`newTownId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_releaseId_idx` ON `hkgovPlandPlanningCells` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_sourceRecordId_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_current_lookup_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_release_validity_idx` ON `hkgovPlandPlanningCells` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_tpuCode_idx` ON `hkgovPlandPlanningCells` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_spuCode_idx` ON `hkgovPlandPlanningCells` (`spuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_ppuCode_idx` ON `hkgovPlandPlanningCells` (`ppuCode`);