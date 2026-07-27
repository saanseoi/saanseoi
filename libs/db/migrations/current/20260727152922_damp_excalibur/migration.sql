CREATE TABLE `divisionStatistics` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`divisionId` text NOT NULL,
	`districtCode` text NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	`sourceKeys` text NOT NULL,
	`sources` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionStatistics_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE INDEX `divisionStatistics_divisionId_referenceYear_idx` ON `divisionStatistics` (`snapshotId`,`divisionId`,`referenceYear`);