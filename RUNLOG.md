# RUNLOG.md

## Run 001 — bootstrap foundation
Hypothesis: a dependency-light core can make truth, dedupe, state, resume, and application semantics objectively testable before attaching live discovery/browser integrations.

Observed baseline: target repository was empty; upstream project was inspected for its profile, score, ledger, round, attention, telemetry, privacy, and confirmation contracts.

Change: implemented explicit graph modules, career evidence KB, checker split, bounded repair, real minimal PDF generation, mock ATS, checkpoints and ledger.

Verification: `npm run validate`, `npm run test:e2e`, `npm run test:scale`.

Next action: port/adapt upstream secure profile storage and discovery/application adapters behind the new contracts, then add live-readonly discovery verification and local browser ATS fixtures.

## Run 002 — Twenty CRM control center
Hypothesis: Twenty can act as the job agent's operator console without forking its core CRM, using a private Twenty app for objects, page layouts, navigation, front components and logic functions.

Observed: Twenty's current SDK supports app-defined objects, fields, page layouts, navigation, front components, logic functions and application variables. The existing job agent lacked live discovery, a persistent seen-job catalog, an approval gate and a browser implementation.

Change: added Greenhouse/Lever/Ashby/JSON discovery, JobStore, control-plane HTTP API, discovery daemon, generic Playwright ATS adapter, resume-hash approval lock, Twenty CRM objects/views/dashboard, configuration sync and exact-resume upload/preview.

Verification: `npm run check` and `node --test tests/control-plane.test.mjs` pass in the merged source tree (4/4). The UI preview was manually inspected at 1440×1000. A second headless Chromium capture attempt in this execution environment hung on DBus/zygote shutdown, so that retry is not counted as verification; the previously rendered preview artifact is retained.

Next action: install/publish the private app into the target Twenty workspace, run against authorized real job forms, and add ATS-specific adapters for any forms routed to Attention.
