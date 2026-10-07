# Web deployment

Source: https://github.com/tclare95/isHPPOpen. Production branch: `main`.

`Web CI` runs lint, Jest and a production build for pull requests and changes
to main. It uses dummy database/auth configuration and needs no production
secrets. Node 22 satisfies the application's Node 20.19+ baseline.

## One-time GitHub and Vercel setup

1. Enable GitHub Actions. Protect `main`: require a pull request, the `Web checks`
   status check, and an up-to-date branch before merging. Disable force pushes.
   Run the workflow once so the check is available in the protection selector.
2. Connect the repository to the existing Vercel project. Set production branch
   to `main`, root directory to the repository root, install command to `npm ci`
   and build command to `npm run build`. Use Node 22 in the project settings.
3. Configure the environment variables listed in the README in Vercel's
   Production environment. Use a separate test database and test auth/email
   credentials for Preview deployments; preview builds must not write to the
   production database or send production alerts.
4. Check that Vercel's Git integration creates preview deployments for PRs and
   production deployments from protected main. GitHub CI and Vercel builds run
   independently; branch protection is the merge gate. Restrict direct pushes
   and manual production deployments to trusted maintainers.

Use the native [Vercel Git integration](https://vercel.com/docs/git), so no
Vercel token or second deployment workflow is required. This setup does not
change the deployed project or its settings automatically.

## Release and rollback

Open a PR, check CI and the Vercel preview, then merge. After production is ready,
verify the home page, river levels and forecast APIs, authentication, and the
configured alert cron. Keep `CRON_SECRET` in Production and confirm the Vercel
plan supports the schedule in `vercel.json`.

For an urgent rollback, promote a known-good deployment in Vercel. Follow with
a revert PR so main reflects production. Changes to shared S3/MongoDB contracts
require a coordinated producer-first rollout across the suite.
