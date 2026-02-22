# Lessons Learned

## What works well
- Centralized Mongo connection caching avoids repeated reconnect overhead.
- Service extraction (`libs/services`) makes API handlers easier to test and reason about.
- SWR-based fetch hooks keep UI code concise for loading/error states.

## Recurring pitfalls
- Environment variables are required very early because `libs/database.js` validates on import.
- API routes currently use mixed request-body parsing styles; this can cause subtle bugs in tests and clients.
- Auth checks are route-level and easy to miss if new mutation endpoints are added quickly.

## Practical guidance for future changes
1. **Add or modify endpoint behavior in the service first**, then keep route handlers thin.
2. **Write/update API tests with each endpoint change**, especially around auth and validation paths.
3. **Keep public GET endpoints explicit** and lock down writes with `getServerSession`.
4. **Document new env vars immediately** in `AGENTS.md` and README.
5. **Prefer small, incremental refactors** over broad rewrites due to mixed legacy/new patterns.

## Quality checklist used for this repository
- [ ] Does the change preserve Mongo connection reuse?
- [ ] Are unauthorized writes blocked?
- [ ] Is validation performed close to domain logic?
- [ ] Are docs updated for architecture/operational impact?
- [ ] Are lint and tests executed before merge?
