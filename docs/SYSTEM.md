# isHPPOpen suite and RDP integration

This is the original isHPPOpen deployment and producer/consumer coordination guide. **RDP is now an independently owned data platform**, not merely another scraper behind the website. See [RDP integration](RDP-INTEGRATION.md) and the [RDP ecosystem guide](https://github.com/tclare95/river-data-platform/blob/main/docs/ECOSYSTEM.md). The following four repositories have independent runtime and release lifecycles:

| Component | Repository | Deployment | Checks |
| --- | --- | --- | --- |
| RDP platform | [tclare95/river-data-platform](https://github.com/tclare95/river-data-platform) | Manual, guarded staging/production AWS release processes; inspect [current production runbook](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCTION.md) | .NET tests, SAM/lint, stage/IAM release guards |
| Web | [tclare95/isHPPOpen](https://github.com/tclare95/isHPPOpen) | Vercel Git integration, protected main | Lint, Jest, Next.js build |
| Scraper | [tclare95/ishppopenScraper](https://github.com/tclare95/ishppopenScraper) | Manual SAM prepare, separate manual apply of verified change set | Node syntax, SAM lint/container build, plan provenance |
| Predictor | [tclare95/trent-predictor](https://github.com/tclare95/trent-predictor) (private) | Manual Docker/ECR prepare, separate manual apply of verified Terraform plan | Python/shell syntax, Terraform validation, Lambda image import, plan provenance |

The isHPPOpen repository owns its **site-specific integration and historical suite coordination** documentation. RDP owns its own [product vision](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCT_VISION.md), [platform architecture and operations](https://github.com/tclare95/river-data-platform/blob/main/docs/DOCUMENTATION.md), and the home for **new platform-specific OpenSpecs**. Existing suite OpenSpecs in this repo remain authoritative until individually relocated; see [OpenSpec transition guidance](../openspec/README.md). Each backend owns its deployment/runbook evidence. AWS workflows use separately approved prepare/apply steps; consult the dated release record rather than assuming a deployment is enabled.

Use [shared contracts](CONTRACTS.md) for producer/consumer compatibility and [RDP-INTEGRATION](RDP-INTEGRATION.md) for the current/future data boundary.

## Runtime contracts

| Producer | Storage contract | Consumer |
| --- | --- | --- |
| RDP independently collected observations (release selection is stage-specific) | Authenticated AWS_IAM/SigV4 published measurement catalogue, latest/history/health | Trusted isHPPOpen server adapters; display, history, later alerts only under per-consumer source modes |
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

## Verified activation of the original three repositories (8 October 2026)

The following is **historical 8 October evidence**, not a statement of RDP's later production cutovers. The original three repositories had protected main branches and passing CI. The backend
OIDC roles and main-only environments are configured; both manual prepare/apply
pipelines are enabled. Predictor state is migrated to its private encrypted,
versioned S3 backend with locking. Training stays local and model publishing
remains a separate reviewed action.

- Predictor [apply 37790398717](https://github.com/tclare95/trent-predictor/actions/runs/37790398717)
  succeeded. Its first scheduled output passed the 288-row, finite-value,
  15-minute-step and 72-hour-horizon checks.
- Scraper [apply 37797183663](https://github.com/tclare95/ishppopenScraper/actions/runs/37797183663)
  succeeded. The three functions are Active on Node.js 22 with the verified
  replacement secret; existing history settings and schedules were preserved.
- Web production is READY on Git commit `69b3797` after an explicitly approved
  credential-only transition and redeploy. Public API smoke checks passed.

The replacement secret is primary in eu-west-2 with a synchronized eu-west-1
replica. Both live applications use it. Atlas old-user revocation, narrowing the
replacement user's database role, and Preview isolation remain follow-ups.
No model upload or manual production Lambda invocation was performed.
