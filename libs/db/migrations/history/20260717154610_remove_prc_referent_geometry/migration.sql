DELETE FROM `snapshotVersionChanges`
WHERE `recordType` = 'divisionArea' AND `recordId` IN (
  SELECT `id` FROM `divisionAreas`
  WHERE `divisionId` = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be'
);
--> statement-breakpoint
DELETE FROM `divisionAreas`
WHERE `divisionId` = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be';
--> statement-breakpoint
CREATE TABLE `divisionAreas_rebuilt` (
  `id` text NOT NULL,
  `variant` text DEFAULT 'overture' NOT NULL,
  `bbox` text,
  `geometry` text,
  `sourceKeys` text,
  `sources` text,
  `type` text NOT NULL,
  `isLand` integer,
  `isTerritorial` integer,
  `divisionId` text NOT NULL,
  `versionHash` text NOT NULL,
  `sourceReleaseId` text NOT NULL,
  `snapshotId` text NOT NULL,
  `isCurrent` integer NOT NULL,
  `createdAt` text NOT NULL,
  `updatedAt` text NOT NULL,
  CONSTRAINT `divisionAreas_rebuilt_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `divisionAreas_rebuilt` (
  `id`, `variant`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`,
  `isLand`, `isTerritorial`, `divisionId`, `versionHash`, `sourceReleaseId`,
  `snapshotId`, `isCurrent`, `createdAt`, `updatedAt`
)
SELECT
  `id`, `variant`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`,
  `isLand`, `isTerritorial`, `divisionId`, `versionHash`, `sourceReleaseId`,
  `snapshotId`, `isCurrent`, `createdAt`, `updatedAt`
FROM `divisionAreas`;
--> statement-breakpoint
DROP TABLE `divisionAreas`;
--> statement-breakpoint
ALTER TABLE `divisionAreas_rebuilt` RENAME TO `divisionAreas`;
--> statement-breakpoint
CREATE INDEX `divisionAreas_current_lookup_idx` ON `divisionAreas` (`id`, `isCurrent`);
--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`divisionId`, `isCurrent`);
--> statement-breakpoint
CREATE INDEX `divisionAreas_sourceReleaseId_idx` ON `divisionAreas` (`sourceReleaseId`);
--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshotId_idx` ON `divisionAreas` (`snapshotId`);
