# Full-Stack Job Application Agent

Evidence-first job application automation for a large personal full-stack job search. This repository starts from the behavioral contracts of `vaibhavarora14/job-application-agent` and restructures the core around an explicit execution graph and Loop Engineering-style persistent state.

## What is different

Instead of treating one canonical resume as the content source for every application, the system uses a verified career evidence database. A resume planner selects relevant evidence for a job; the generator can only emit provenance-linked claims; a separate truth checker tries to reject unsupported claims before a PDF can be rendered or uploaded.

```text
job -> normalize -> hard filter -> JD analysis -> evidence matching -> fit score
    -> resume plan -> generate -> independent truth check -> repair (bounded)
    -> render/validate PDF -> duplicate/ownership check -> ATS adapter
    -> confirmed submission | attention | unconfirmed | failure -> ledger
```

## Safety and truth guarantees

- Every evidence record needs a stable ID and `verified: true`.
- Generated material claims carry `evidenceIds`.
- Unsupported claims, unknown evidence IDs, unsupported skills, and invented numeric metrics are rejected.
- CAPTCHA/legal-attestation flows route to attention rather than bypass attempts.
- `SUBMITTED` is stored only after explicit adapter confirmation.
- A lock prevents two workers from becoming submission owner for the same requisition.

## Quick start

Requires Node.js 20+.

```bash
npm test
node src/cli.mjs profile validate candidate/example.json
node src/cli.mjs dry-run candidate/example.json candidate/preferences.example.json fixtures/fullstack-job.json .run/demo
node src/cli.mjs apply-one candidate/example.json candidate/preferences.example.json fixtures/fullstack-job.json .run/demo-live
```

`dry-run` uses an ambiguous mock submission boundary so it cannot claim a successful application. `apply-one` uses the safe local mock ATS fixture in this milestone.

## Candidate evidence

Use `candidate/example.json` as the schema starting point. Do not put real secrets in the repository. Candidate facts should be stored locally and every material career fact should have a stable evidence ID.

## Configuration

Search preferences are data, not hard-coded logic. See `candidate/preferences.example.json` for title families, target skills, exclusions, work modes, employment type, and review/auto thresholds.

## Current milestone

This repository currently proves the core workflow locally, including a generated PDF and mock submission confirmation. Live employer discovery, live Greenhouse/Lever/Ashby adapters, secure OS profile migration, and LLM provider/cost plumbing remain explicit external milestones; see `STATE.md`.

## Validation

```bash
npm run check
npm test
npm run test:e2e
npm run test:scale
npm run validate
```

The project intentionally does not call an implementation “done” merely because code exists. `LOOP.md`, `STATE.md`, and `RUNLOG.md` record objective state and remaining boundaries.
