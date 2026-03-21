# isHPPOpen

A Next.js App Router application powering ishppopen.co.uk.

The site provides a quick way to check if the Holme Pierrepont whitewater course is open. Water level data, events and status updates are stored in MongoDB and served through App Router Route Handlers under `app/api`. React Bootstrap components power the UI and SWR hooks fetch data in near real time. An admin section lets authorised users manage events and messages.

## Local development

1. Install dependencies:
   - `npm ci`
2. Create `.env.local` with:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `S3_LEVELS_URL` (public S3 JSON endpoint for latest levels payload)
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`
   - `AUTH0_DOMAIN`
   - `NEXTAUTH_SECRET` (`SECRET` is legacy-only fallback during migration)
   - `NEXTAUTH_URL` (for local development use `http://localhost:3000` including the scheme)
   - `S3_FORECAST_URL`
   - `SITE_URL` (preferred canonical app URL used in email links)
   - `RESEND_API_KEY` (for Colwick email alerts)
   - `ALERTS_FROM_EMAIL` (transactional sender for Colwick email alerts)
   - `ALERTS_REPLY_TO_EMAIL` (optional)
   - `CRON_SECRET` (shared secret used by the scheduled Colwick alert evaluator)
3. Run the app:
   - `npm run dev`

## Useful scripts
- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm test` - run Jest tests
- `npm run test:coverage` - run tests with coverage
- `npm run lint` - run ESLint

## Admin workflows
- Events admin supports create, edit, delete, reset, and clear success/error confirmation states.
- Site banner admin supports title, message, visibility toggle, scheduled start/end, immediate-start banners, and open-ended banners.

## Colwick alert MVP
- The Trent dashboard now supports Colwick-only email alert signup for live level and S3 forecast threshold crossings.
- Alert delivery stays Vercel-first: public signup/confirm/unsubscribe Route Handlers plus a scheduled evaluator at `/api/internal/alerts/run`.
- Vercel Cron should call the scheduled route every 15 minutes. The included [vercel.json](vercel.json) defines this schedule.
- Alerts use double opt-in confirmation and include unsubscribe links in every alert email.
- Email confirmation and unsubscribe links now return users to the Trent dashboard with a visible success or error message.
- Users can also request a one-time email link to view and remove existing Colwick alerts at `/alerts`; the management session is rotated on first use and expires after 30 minutes.

## API route conventions
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (API/application layer + API route conventions) for the canonical, maintained standard.

## Project documentation
- Agent operating guidance: [AGENTS.md](AGENTS.md)
- Architecture overview and key functionality: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Engineering retrospective notes: [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)

Documentation ownership:
- Runtime architecture and API standards: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Process and guardrails for contributors/agents: [AGENTS.md](AGENTS.md)
- Retrospective guidance and pitfalls: [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)
