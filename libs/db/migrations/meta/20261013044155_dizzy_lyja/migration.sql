PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotRecipeInputs` (
	`snapshotRecipeId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`selectionPolicyJson` text NOT NULL,
	CONSTRAINT `snapshotRecipeInputs_pk` PRIMARY KEY(`snapshotRecipeId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotRecipeInputs_snapshotRecipeId_snapshotRecipes_id_fk` FOREIGN KEY (`snapshotRecipeId`) REFERENCES `snapshotRecipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotRecipeInputs_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotRecipeInputs`(`snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `maxLagDays`, `priority`, `selectionPolicyJson`) SELECT `snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `maxLagDays`, `priority`, `selectionPolicyJson` FROM `snapshotRecipeInputs`;--> statement-breakpoint
DROP TABLE `snapshotRecipeInputs`;--> statement-breakpoint
ALTER TABLE `__new_snapshotRecipeInputs` RENAME TO `snapshotRecipeInputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;