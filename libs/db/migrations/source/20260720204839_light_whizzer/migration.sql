CREATE TABLE `hkgovCenstatdDivisionAreaDerivatives` (
	`sourceRecordId` text NOT NULL,
	`inputVersionHash` text NOT NULL,
	`transform` text NOT NULL,
	`derivation` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreaDerivatives_pk` PRIMARY KEY(`sourceRecordId`, `inputVersionHash`, `transform`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_releaseId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_current_lookup_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_release_validity_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_input_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`inputVersionHash`,`transform`);
--> statement-breakpoint
INSERT INTO `hkgovCenstatdDivisionAreaDerivatives` (
	`sourceRecordId`,
	`inputVersionHash`,
	`transform`,
	`derivation`,
	`geometry`,
	`bbox`,
	`versionHash`,
	`releaseId`,
	`validFromRelease`,
	`validToRelease`,
	`isCurrent`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`exact`.`sourceRecordId`,
	`exact`.`versionHash`,
	'simplified',
	`derived`.`derivation`,
	`derived`.`geometry`,
	`derived`.`bbox`,
	`derived`.`versionHash`,
	`derived`.`releaseId`,
	`derived`.`validFromRelease`,
	`derived`.`validToRelease`,
	`derived`.`isCurrent`,
	`derived`.`createdAt`,
	`derived`.`updatedAt`
FROM `hkgovCenstatdDivisionAreas` AS `derived`
INNER JOIN `hkgovCenstatdDivisionAreas` AS `exact`
	ON `exact`.`sourceRecordId` = 'CENSTATD:' || `derived`.`districtClass`
	AND `exact`.`censusYear` = `derived`.`censusYear`
	AND `exact`.`isCurrent` = 1
WHERE `derived`.`sourceRecordId` LIKE 'CENSTATD:simplified:%'
	AND `derived`.`derivation` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `hkgovCenstatdDivisionAreaI18n`
WHERE `sourceRecordId` LIKE 'CENSTATD:simplified:%';
--> statement-breakpoint
DELETE FROM `hkgovCenstatdDivisionAreas`
WHERE `sourceRecordId` LIKE 'CENSTATD:simplified:%';
