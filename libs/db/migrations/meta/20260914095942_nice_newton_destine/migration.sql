CREATE TABLE `apiFieldProvenanceGroups` (
	`apiReleaseSetId` text NOT NULL,
	`resourceType` text NOT NULL,
	`apiField` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`isDeleted` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiFieldProvenanceGroups_pk` PRIMARY KEY(`apiReleaseSetId`, `resourceType`, `apiField`, `variant`),
	CONSTRAINT `fk_apiFieldProvenanceGroups_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `apiFieldProvenanceGroups_release_idx` ON `apiFieldProvenanceGroups` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiFieldProvenanceGroups_field_idx` ON `apiFieldProvenanceGroups` (`resourceType`,`apiField`,`variant`);