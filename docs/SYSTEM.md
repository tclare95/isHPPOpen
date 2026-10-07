# isHPPOpen suite

Three repositories have independent runtime and release lifecycles:

| Component | Repository | Deployment | Checks |
| --- | --- | --- | --- |
| Web | [tclare95/isHPPOpen](https://github.com/tclare95/isHPPOpen) | Vercel Git integration, protected main | Lint, Jest, Next.js build |
| Scraper | [tclare95/ishppopenScraper](https://github.com/tclare95/ishppopenScraper) | Manual SAM change set, production approval | Node syntax, SAM lint/container build |
| Predictor | tclare95/trent-predictor (private repository to create/connect) | Manual Docker/ECR + saved Terraform plan, production approval | Python/shell syntax, Terraform validation, Lambda image import |

The suite documentation lives in the web repository, avoiding a fourth source
repository just for the local coordination folder. Each backend owns its own
`DEPLOYMENT.md`, infrastructure and workflow files. AWS workflows are disabled
until the repository variable `DEPLOYMENT_ENABLED=true` is configured after setup.

## Runtime contracts

| Producer | Storage contract | Consumer |
| --- | --- | --- |
| Scraper, eu-west-1, every 15 minutes | MongoDB status/river/CSO collections; public `levels/latest.json` and dated S3 history | Web services; `S3_LEVELS_URL` |
| Predictor, eu-west-2, hourly | `ishppopen-data/forecasts/colwick_forecast.csv`; accuracy, stability, history and model-health CSVs | Web forecast APIs and Colwick alert evaluator; `S3_FORECAST_URL` |
| Reviewed model training | `models/xgb_colwick_horizon.pkl` in S3 | Predictor Lambda |

Keep object keys, collection names, station IDs, units, UTC timestamps, headers,
null behavior and schedule cadence compatible. Deploy additive producer changes
before switching consumers; remove legacy fields only after consumers are live.
The deployment setup does not change these contracts or upload a trained model.

## Activation checklist

1. Connect/push the private predictor repo and review local edits in the existing
   repos. Do not commit environments, Terraform state, models or generated data.
2. Rotate the database credential from scraper Git history; store its replacement
   in Secrets Manager and coordinate the web/scraper transition. Removing it from
   the current template alone does not invalidate the old credential.
3. Set up AWS OIDC roles and protected `production-plan`/`production` environments
   as described in each backend's deployment guide. Configure required reviewers
   for production execution and restrict environments to main.
4. Migrate the predictor's existing state into a private versioned S3 bucket,
   confirm existing resources and match GitHub variables to production settings.
5. Enable branch protection with the respective CI check and connect/check
   Vercel's production and preview settings. Use isolated preview data/secrets.
6. Activate AWS workflow variables only after the above steps, then perform each
   deployment as a separately authorized action and check feed freshness.

Deployment workflows do not rotate credentials, create IAM/OIDC bootstrap roles,
migrate state or configure GitHub/Vercel automatically. These are operational
changes distinct from local code preparation.
