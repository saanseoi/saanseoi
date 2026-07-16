ALTER TABLE `hkgovPlandDivisions` ADD `wasGeometryRepaired` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovPlandDivisions` ADD `canonicalGeometry` text;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTownDivisionAreas` ADD `wasGeometryRepaired` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTownDivisionAreas` ADD `canonicalGeometry` text;