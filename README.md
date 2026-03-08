# isHPPOpen

A Next.js App Router application powering ishppopen.co.uk.

The site provides a quick way to check if the Holme Pierrepont whitewater course is open. Water level data, events and status updates are stored in MongoDB and served through App Router Route Handlers under `app/api`. React Bootstrap components power the UI and SWR hooks fetch data in near real time. An admin section lets authorised users manage events and messages.

## Local development

1. Install dependencies:
   - `npm ci`
2. Create `.env.local` with:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`
   - `AUTH0_DOMAIN`
   - `NEXTAUTH_SECRET` (`SECRET` is legacy-only fallback during migration)
3. Run the app:
   - `npm run dev`

## Useful scripts
- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm test` - run Jest tests
- `npm run test:coverage` - run tests with coverage
- `npm run lint` - run ESLint

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
