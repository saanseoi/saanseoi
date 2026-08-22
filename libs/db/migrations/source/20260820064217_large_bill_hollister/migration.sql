ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` RENAME COLUMN `referenceYear` TO `referencePeriodCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` ADD `referencePeriodStart` text;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` ADD `referencePeriodEnd` text;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` ADD `referencePeriodGranularity` text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` ADD `referencePeriodEndYear` text NOT NULL DEFAULT '0000';--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` RENAME COLUMN `referenceYear` TO `referencePeriodCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` ADD `referencePeriodStart` text;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` ADD `referencePeriodEnd` text;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` ADD `referencePeriodGranularity` text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` ADD `referencePeriodEndYear` text NOT NULL DEFAULT '0000';--> statement-breakpoint
UPDATE `hkgovCenstatdStatistics`
SET `referencePeriodCode` = CASE
	WHEN NULLIF(trim(CAST(json_extract(`rawProperties`, '$.year') AS text)), '') GLOB '[0-9][0-9][0-9][0-9]'
		THEN trim(CAST(json_extract(`rawProperties`, '$.year') AS text))
	WHEN NULLIF(trim(CAST(json_extract(`rawProperties`, '$.PERIOD') AS text)), '') IS NOT NULL
		THEN trim(CAST(json_extract(`rawProperties`, '$.PERIOD') AS text))
	WHEN NULLIF(trim(CAST(json_extract(`rawProperties`, '$.YEAR') AS text)), '') IS NOT NULL
		AND NULLIF(trim(CAST(json_extract(`rawProperties`, '$.QUARTER') AS text)), '') IS NOT NULL
		THEN trim(CAST(json_extract(`rawProperties`, '$.YEAR') AS text)) || '-Q' ||
			ltrim(upper(trim(CAST(json_extract(`rawProperties`, '$.QUARTER') AS text))), 'Q')
	ELSE `referencePeriodCode`
END;--> statement-breakpoint
UPDATE `hkgovCenstatdDistrictLandAreaPopulationDensities`
SET
	`referencePeriodStart` = CASE
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]' THEN `referencePeriodCode` || '-01-01'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN printf(
			'%s-%02d-01', substr(`referencePeriodCode`, 1, 4),
			(CAST(substr(`referencePeriodCode`, 7, 1) AS integer) - 1) * 3 + 1
		)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN
			substr(`referencePeriodCode`, 1, 4) || CASE substr(`referencePeriodCode`, 7, 1) WHEN '1' THEN '-01-01' ELSE '-07-01' END
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
			AND CAST(substr(`referencePeriodCode`, 6, 2) AS integer) BETWEEN 1 AND 12 THEN `referencePeriodCode` || '-01'
		ELSE NULL
	END,
	`referencePeriodEnd` = CASE
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]' THEN `referencePeriodCode` || '-12-31'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN date(
			printf(
				'%s-%02d-01', substr(`referencePeriodCode`, 1, 4),
				(CAST(substr(`referencePeriodCode`, 7, 1) AS integer) - 1) * 3 + 1
			),
			'+3 months', '-1 day'
		)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN
			substr(`referencePeriodCode`, 1, 4) || CASE substr(`referencePeriodCode`, 7, 1) WHEN '1' THEN '-06-30' ELSE '-12-31' END
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
			AND CAST(substr(`referencePeriodCode`, 6, 2) AS integer) BETWEEN 1 AND 12 THEN date(`referencePeriodCode` || '-01', '+1 month', '-1 day')
		ELSE NULL
	END,
	`referencePeriodGranularity` = CASE
		WHEN length(`referencePeriodCode`) = 4 THEN 'year'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN 'quarter'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN 'half-year'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' THEN 'month'
		WHEN `referencePeriodCode` LIKE '%/%' OR length(`referencePeriodCode`) = 9 THEN 'multi-year'
		ELSE 'unknown'
	END,
	`referencePeriodEndYear` = CASE
		WHEN substr(`referencePeriodCode`, -4) GLOB '[0-9][0-9][0-9][0-9]' THEN substr(`referencePeriodCode`, -4)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9]' THEN printf(
			'%04d',
			(CAST(substr(`referencePeriodCode`, 1, 4) AS integer) / 100 * 100) +
			CAST(substr(`referencePeriodCode`, 6, 2) AS integer) +
			CASE WHEN CAST(substr(`referencePeriodCode`, 6, 2) AS integer) < CAST(substr(`referencePeriodCode`, 3, 2) AS integer) THEN 100 ELSE 0 END
		)
		ELSE substr(`referencePeriodCode`, 1, 4)
	END;--> statement-breakpoint
UPDATE `hkgovCenstatdStatistics`
SET
	`referencePeriodStart` = CASE
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]' THEN `referencePeriodCode` || '-01-01'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN printf(
			'%s-%02d-01', substr(`referencePeriodCode`, 1, 4),
			(CAST(substr(`referencePeriodCode`, 7, 1) AS integer) - 1) * 3 + 1
		)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN
			substr(`referencePeriodCode`, 1, 4) || CASE substr(`referencePeriodCode`, 7, 1) WHEN '1' THEN '-01-01' ELSE '-07-01' END
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
			AND CAST(substr(`referencePeriodCode`, 6, 2) AS integer) BETWEEN 1 AND 12 THEN `referencePeriodCode` || '-01'
		ELSE NULL
	END,
	`referencePeriodEnd` = CASE
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]' THEN `referencePeriodCode` || '-12-31'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN date(
			printf(
				'%s-%02d-01', substr(`referencePeriodCode`, 1, 4),
				(CAST(substr(`referencePeriodCode`, 7, 1) AS integer) - 1) * 3 + 1
			),
			'+3 months', '-1 day'
		)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN
			substr(`referencePeriodCode`, 1, 4) || CASE substr(`referencePeriodCode`, 7, 1) WHEN '1' THEN '-06-30' ELSE '-12-31' END
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
			AND CAST(substr(`referencePeriodCode`, 6, 2) AS integer) BETWEEN 1 AND 12 THEN date(`referencePeriodCode` || '-01', '+1 month', '-1 day')
		ELSE NULL
	END,
	`referencePeriodGranularity` = CASE
		WHEN length(`referencePeriodCode`) = 4 THEN 'year'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]' THEN 'quarter'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-H[1-2]' THEN 'half-year'
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' THEN 'month'
		WHEN `referencePeriodCode` LIKE '%/%' OR length(`referencePeriodCode`) = 9 THEN 'multi-year'
		ELSE 'unknown'
	END,
	`referencePeriodEndYear` = CASE
		WHEN substr(`referencePeriodCode`, -4) GLOB '[0-9][0-9][0-9][0-9]' THEN substr(`referencePeriodCode`, -4)
		WHEN `referencePeriodCode` GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9]' THEN printf(
			'%04d',
			(CAST(substr(`referencePeriodCode`, 1, 4) AS integer) / 100 * 100) +
			CAST(substr(`referencePeriodCode`, 6, 2) AS integer) +
			CASE WHEN CAST(substr(`referencePeriodCode`, 6, 2) AS integer) < CAST(substr(`referencePeriodCode`, 3, 2) AS integer) THEN 100 ELSE 0 END
		)
		ELSE substr(`referencePeriodCode`, 1, 4)
	END;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_referenceYear_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_referenceYear_idx`;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_referencePeriod_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`referencePeriodEndYear`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_referencePeriod_idx` ON `hkgovCenstatdStatistics` (`referencePeriodEndYear`,`referencePeriodCode`);
