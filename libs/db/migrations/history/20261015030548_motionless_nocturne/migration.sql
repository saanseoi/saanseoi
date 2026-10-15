CREATE TABLE `placeDivisionDefinitions` (
	`id` text PRIMARY KEY,
	`definition` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `places` ADD `countryId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `areaId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `districtId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `townId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `ruralAreaId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `macrohoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `neighbourhoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `villageId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `microhoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `hamletId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `landformId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `divisionDefinitionSetId` text;