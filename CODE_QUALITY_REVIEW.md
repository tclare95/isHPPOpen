# Code Quality & Simplification Opportunities

This review highlights the highest-impact improvements to align the repository with good Next.js practices and reduce maintenance overhead.

## 1) Consolidate API route error/session handling (High impact)

### Why
Several API routes contain deeply nested `try/catch` blocks and repeated auth checks, which makes flows harder to reason about and easier to break.

### Evidence
- `pages/api/events.js` had multiple nested `try/catch` layers and repeated unauthorized responses.
- Similar structure appears in routes like `pages/api/sitebanner.js`.

### Recommendation
- Move auth checks into small helpers (`requireSession`) and use early returns.
- Use one structured error boundary per route (plus domain-level throws) instead of nesting.
- Standardize method dispatch with small handler maps for readability.

---

## 2) Centralize request body parsing/validation (High impact)

### Why
Inconsistent body parsing (`JSON.parse(Object.keys(body)[0])`) is brittle and tightly coupled to transport quirks.

### Evidence
- Event POST logic used ad-hoc parsing for string and object payloads.

### Recommendation
- Add a tiny shared parser (or validation schema via Yup/Zod) under `libs/`.
- Validate required fields and types once, return consistent `400` messages.
- Keep route handlers focused on orchestration, not payload plumbing.

---

## 3) Introduce API response contracts (Medium-high)

### Why
Responses vary by route (`message`, `error`, and raw payloads). This complicates frontend error handling.

### Recommendation
- Standardize success/error envelopes, e.g. `{ ok: true, data }` / `{ ok: false, error }`.
- Publish these contracts in README or a docs file for admin/frontend consumers.

---

## 4) Align data fetching strategy with Next.js primitives (Medium)

### Why
The app mixes static data and live client fetches appropriately in places, but can improve consistency and cache behavior.

### Evidence
- Home page uses `getStaticProps` with revalidation for events/message (`pages/index.js`), which is good.

### Recommendation
- Keep highly dynamic operational data client-side (SWR), keep editorial/event data ISR/static.
- Add documented revalidate windows per domain (events, banner, status) and rationale.

---

## 5) Expand route-level test coverage for critical paths (Medium)

### Why
Some API tests only cover happy-path GET flows.

### Evidence
- `__tests__/api/events-api.test.js` currently validates GET success only.

### Recommendation
- Add tests for POST unauthorized, POST invalid body, DELETE missing id, and service failures.
- Focus on permission and input validation behavior first.

---

## 6) Small consistency cleanups (Low-medium)

### Recommendation
- Keep status code semantics strict (`400` validation, `403` auth, `404` missing resource, `500` server).
- Prefer shared logger utility for timestamp/context formatting.
- Keep each API route under ~100 lines by extracting route-specific helpers.
