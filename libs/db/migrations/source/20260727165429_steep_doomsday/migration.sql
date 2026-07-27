CREATE TABLE `hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`datasetCode` text NOT NULL,
	`layerName` text NOT NULL,
	`referenceYear` text NOT NULL,
	`featureId` text NOT NULL,
	`properties` text NOT NULL,
	`sourceFeature` text NOT NULL,
	`sourceGeometry` text,
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
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_releaseId_idx` ON `hkgovCenstatdStatistics` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_sourceRecordId_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_current_lookup_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_dataset_layer_idx` ON `hkgovCenstatdStatistics` (`datasetCode`,`layerName`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_referenceYear_idx` ON `hkgovCenstatdStatistics` (`referenceYear`);