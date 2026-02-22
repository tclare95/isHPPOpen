# isHPPOpen

A Next.js application powering ishppopen.co.uk.

The site provides a quick way to check if the Holme Pierrepont whitewater course is open. Water level data, events and status updates are stored in MongoDB and served through Next.js API routes. React Bootstrap components power the UI and SWR hooks fetch data in near real time. An admin section lets authorised users manage events and messages.

## Local development

1. Install dependencies:
   - `npm ci`
2. Create `.env.local` with:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`
   - `AUTH0_DOMAIN`
   - `NEXTAUTH_SECRET` (or `SECRET` fallback)
3. Run the app:
   - `npm run dev`

## Useful scripts
- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm test` - run Jest tests
- `npm run test:coverage` - run tests with coverage
- `npm run lint` - run ESLint

## Project documentation
- Agent operating guidance: `AGENTS.md`
- Architecture overview and key functionality: `docs/ARCHITECTURE.md`
- Engineering retrospective notes: `docs/LESSONS_LEARNED.md`
