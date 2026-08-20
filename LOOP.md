# LOOP.md — Full-Stack Job Application Agent

## Objective
Build the smallest reliable system that discovers/accepts jobs, filters them, evaluates fit against verified candidate evidence, creates a job-specific ATS-safe resume, independently verifies every claim, applies through an adapter, confirms submission, and persists an auditable ledger.

## Non-negotiable constraints
- Zero fabrication: every material resume claim must map to verified evidence IDs.
- No CAPTCHA bypass, anti-bot bypass, credential theft, cookie extraction, or access-control evasion.
- Submission is `SUBMITTED` only with reliable confirmation.
- Side effects are deduplicated and submission ownership is exclusive.
- Candidate secrets and sensitive data are not written to logs.
- Repair loops have a hard cap of 3 attempts per root cause.

## Execution graph
`normalize -> dedupe -> hard-filter -> JD analysis -> evidence match -> score -> resume plan -> generator -> independent truth checker -> targeted repair -> PDF render/validate -> duplicate check -> application adapter -> confirmation/attention/error -> ledger`

## Maker/checker split
The resume generator only produces structured content + provenance. `src/truth.mjs` acts as a separate checker and is the only component allowed to approve resume claims.

## Checkpoints
After normalization, assessment, resume planning, verification, PDF readiness, application start, and terminal application state.

## Stop conditions
A job stops on hard filter, failed truth verification after bounded repair, invalid PDF, attention-only question, duplicate, unconfirmed submission, or confirmed submission.

## Current external boundary
Real ATS/browser automation is intentionally behind an adapter. The repository includes a deterministic mock ATS for safe E2E verification before any real-site adapter is authorized.
