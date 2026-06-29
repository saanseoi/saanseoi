ALTER TABLE `divisionsVersions` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `divisionsVersions` RENAME COLUMN `validToMonth` TO `validToCohortKey`;--> statement-breakpoint
ALTER TABLE `address2dVersions` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `address2dVersions` RENAME COLUMN `validToMonth` TO `validToCohortKey`;--> statement-breakpoint
ALTER TABLE `address3dVersions` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `address3dVersions` RENAME COLUMN `validToMonth` TO `validToCohortKey`;--> statement-breakpoint
ALTER TABLE `streetsVersions` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `streetsVersions` RENAME COLUMN `validToMonth` TO `validToCohortKey`;--> statement-breakpoint
ALTER TABLE `placesVersions` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `placesVersions` RENAME COLUMN `validToMonth` TO `validToCohortKey`;