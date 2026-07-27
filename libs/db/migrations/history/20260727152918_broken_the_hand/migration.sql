CREATE TABLE `divisionStatistics` (
	`id` text NOT NULL,
	`divisionId` text NOT NULL,
	`districtCode` text NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	`sourceKeys` text NOT NULL,
	`sources` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionStatistics_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `divisionStatistics_current_lookup_idx` ON `divisionStatistics` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_divisionId_referenceYear_idx` ON `divisionStatistics` (`divisionId`,`referenceYear`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_sourceReleaseId_idx` ON `divisionStatistics` (`sourceReleaseId`);