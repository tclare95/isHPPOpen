# Water-quality rollout

The application change is backward-compatible, but its bounded latest-record query depends on explicit MongoDB indexes. Creating indexes and deploying are separate production actions; neither happens during normal requests.

## 1. Review the migration

Run `npm run db:indexes:water-quality` to print the proposed indexes. This is a dry run and does not connect to MongoDB.

After production approval, run `npm run db:indexes:water-quality -- --apply` with `MONGODB_URI` and `MONGODB_DB` in `.env.local`. The named indexes are idempotent:

- `water_quality_latest` on `waterQuality.scrape_timestamp`
- `cso_id_latest` on `csoData.attributes.Id, csoData.DateScraped`
- `cso_scraped_at` on `csoData.DateScraped`

## 2. Verify query plans

Before deploying, run `explain("executionStats")` for:

```javascript
db.waterQuality.find({}).sort({ scrape_timestamp: -1 }).limit(1)
db.csoData.aggregate([
  { $match: { "attributes.Id": { $in: ["SVT01207"] }, DateScraped: { $gte: new Date(Date.now() - 3600000) } } },
  { $group: { _id: "$attributes.Id", doc: { $top: { sortBy: { DateScraped: -1 }, output: "$$ROOT" } } } }
])
```

Confirm the winning plans use `water_quality_latest` and `cso_id_latest`/`cso_scraped_at`, with no blocking global sort. Record execution time and documents examined.

## 3. Deploy and verify

Deploy the web application only after index verification. Check `/api/waterquality`, `/api/waterquality/csodensity?hours=3`, and one single-CSO endpoint return `200`; confirm stale fixtures produce zero currently spilling locations. No scraper deployment is required.

## Calibration

`npm run calibrate:water-quality` reads (but does not change) the trailing year of Mongo history and prints candidate percentile values. Review and update `libs/waterQualityCalibration.json` in a normal code change; the script never alters production data or runtime thresholds.
