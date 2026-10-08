# Design

Use existing React primitives. Chart data is pure memoized derivation; the sole
clock state is sampled in an effect on the original input dependency set. A local
lint exception documents synchronization with the external clock. Preserve all
columns, sorting, confidence calculations and the absence of a continuously
ticking annotation. Stability rows need no state or effect.

React permits guarded adjustment of a component's own state during render when
inputs invalidate it. Only a missing selected event triggers adjustment; keep
the original first-event/new fallback and explicitly chosen new-event mode.

Banner scheduling uses `useSyncExternalStore` with a boolean snapshot. Subscribe
only to future start/end boundaries, clamping distant timeouts to the browser
limit, replacing timers after focus and cleaning up on unmount. Start is inclusive;
end remains inclusive by expiring at end+1 ms. Scheduled server snapshots are
false so cached markup and initial hydration agree even across date boundaries.
The client resolves current visibility after hydration. Unscheduled snapshots are
true. Existing disabled, empty and invalid-date handling is preserved.

Regression checks cover changing/empty chart data and confidence controls,
annotation sampling, selection deletion/refresh, schedule boundaries, hydration,
distant dates, focus recovery and cleanup. Restore global rules after these pass.
Existing API/source contracts and deployments are outside this change.
