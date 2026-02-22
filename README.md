This is the rewritten implementation of ishppopen.co.uk
This Next.js site shows water levels, events and status for HPP.

The site provides a quick way to check if the Holme Pierrepont whitewater course is open. Water level data, events and status updates are stored in MongoDB and served through Next.js API routes. React Bootstrap components power the UI and SWR hooks fetch data in real time. An admin section lets authorised users manage events and messages.

## Routing and layout migration (App Router)

The public routes `/`, `/forecastinfo`, and `/waterquality` now live in the `app/` directory:

- `app/layout.js` is the global shell for App Router pages and owns global metadata, CSS imports, GTM setup, session wrapping, and Vercel analytics via `app/providers.js`.
- Route-level metadata is declared with `export const metadata` in each `app/**/page.js` file.
- Page data that previously relied on `getStaticProps` or client-only boot fetches has been moved to server-side loading in App Router pages where practical, then passed to client components for interactivity.
- `pages/api/**` remains in place during migration, and non-migrated `pages/**` routes can continue to coexist as fallback routes.

### Conventions for new public pages

1. Add the route in `app/<route>/page.js`.
2. Define `export const metadata` in that page file.
3. Keep server data loading in the page (or a server utility), and pass initial data into client components only when interactive state is needed.
4. Avoid `next/head` and `components/meta.js` for App Router routes.
