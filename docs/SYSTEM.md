# isHPPOpen suite

Three repositories have independent runtime and release lifecycles:

| Component | Repository | Deployment | Checks |
| --- | --- | --- | --- |
| Web | [tclare95/isHPPOpen](https://github.com/tclare95/isHPPOpen) | Vercel Git integration, protected main | Lint, Jest, Next.js build |
| Scraper | [tclare95/ishppopenScraper](https://github.com/tclare95/ishppopenScraper) | Manual SAM prepare, separate manual apply of verified change set | Node syntax, SAM lint/container build, plan provenance |
| Predictor | [tclare95/trent-predictor](https://github.com/tclare95/trent-predictor) (private) | Manual Docker/ECR prepare, separate manual apply of verified Terraform plan | Python/shell syntax, Terraform validation, Lambda image import, plan provenance |

The suite documentation lives in the web repository, avoiding a fourth source
repository just for the local coordination folder. Each backend owns its own
`DEPLOYMENT.md`, infrastructure and workflow files. AWS workflows use explicitly reviewed prepare/apply steps; consult each backend's dated deployment status before assuming a deployment is enabled.

New product changes are planned in the canonical [OpenSpec change directory](../openspec/changes/) using the [spec-driven configuration](../openspec/config.yaml). Current capabilities are synced to `openspec/specs/` on archival. See [shared contracts](CONTRACTS.md) for producer/consumer rules.

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

## Deployment status and remaining operational work

1. Predictor and scraper GitHub source, CI, protected main and approved AWS pipeline setup were verified on 8 October 2026. See each repository's `DEPLOYMENT.md` for recorded successful initial deployments. Do not commit environments, Terraform state, models or generated data.
2. A replacement scraper credential was deployed and the web app switched to it. **Outstanding:** revoke the old Atlas user only after confirming no consumer uses it; restrict the replacement Atlas account to the required database permissions. Removing credentials from source does not erase Git history.
3. AWS OIDC roles and protected production environments are configured. The private-repository plan cannot enforce required reviewers; separately dispatching manual apply with the verified prepare run remains the release decision.
4. Predictor Terraform state was migrated to its private, versioned S3 backend; never overwrite it with old local state.
5. All main branches now require PRs and their CI check. Web also requires Vercel.
   Vercel Git/Node settings are verified; Preview currently shares Production
   database/auth/email variable entries and still needs isolated data/secrets.
6. Each subsequent backend release still requires explicit authorization, a fresh prepare/apply workflow and post-release feed-freshness checks.

Deployment workflows do not rotate credentials, create IAM/OIDC bootstrap roles,
migrate state or configure GitHub/Vercel automatically. These are operational
changes distinct from local code preparation.
