CREATE TABLE `datasetTransforms` (
	`datasetId` text NOT NULL,
	`code` text NOT NULL,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`outputVariant` text NOT NULL,
	`derivation` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `datasetTransforms_pk` PRIMARY KEY(`datasetId`, `code`),
	CONSTRAINT `fk_datasetTransforms_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `datasetTransforms_outputVariant_unique_idx` ON `datasetTransforms` (`outputVariant`);--> statement-breakpoint
CREATE INDEX `datasetTransforms_resourceType_idx` ON `datasetTransforms` (`resourceType`);