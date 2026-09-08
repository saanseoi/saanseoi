CREATE TABLE `releaseProvenance` (
	`releaseId` text PRIMARY KEY,
	`manifestHash` text NOT NULL,
	`byteLength` integer NOT NULL,
	`applicationCount` integer NOT NULL,
	CONSTRAINT `fk_releaseProvenance_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
