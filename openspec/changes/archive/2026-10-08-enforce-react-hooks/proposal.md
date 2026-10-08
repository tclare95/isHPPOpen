# Enforce React Hooks standards

## Why
Issue #56 identified derived chart state, delayed event-selection repair and a
render-time banner clock behind global Hooks lint exceptions.

## What Changes
Derive chart rows from inputs, preserving input-triggered “Now” samples. Repair
missing event selections before rendering the editor. Subscribe banner visibility
to schedule boundaries and browser focus, with consistent hydration. Restore
global Hooks state-effect and purity rules; retain only documented per-line
external-clock samples and the existing anonymous test-mock exception.

## Capabilities
### New Capabilities
- `web-ui-lifecycle`: predictable chart, event-selection and banner time behavior.
### Modified Capabilities
None.

## Impact
Web repository only. No API, storage, source cadence or production changes.
Scheduled banner HTML is hidden until hydration because cached HTML cannot know
the viewer's current time; unscheduled banners remain server-rendered. No framework
migration or new dependency. Submit an unmerged PR; release authorization is separate.
