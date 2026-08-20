# STATE.md

## Verified current state
- Repository bootstrapped as a standalone Node 20 project.
- Candidate career evidence schema implemented with stable evidence IDs and explicit `verified: true` requirement.
- Job normalization, URL canonicalization, hard filters, JD analysis, evidence matching, explainable scoring, resume planning, provenance-preserving generation, independent truth verification, bounded repair, ATS-safe PDF rendering/validation, checkpointing, submission ownership, attention routing, and append-only application ledger implemented.
- Mock ATS provides success, CAPTCHA/legal attention, error, and ambiguous-confirmation behaviors.
- Test suite covers core units, positive/negative/attention/repair/restart E2E, concurrency ownership, PDF extraction, and 1,000-job scale filtering/dedupe.

## Not yet verified against production
- Live employer discovery adapters.
- Live Greenhouse/Lever/Ashby browser adapters.
- OS-backed secret/profile migration from the upstream project.
- Real LLM provider abstraction and token/cost accounting.
- Live browser upload/confirmation semantics.

## Completion status
Foundation milestone only. Do not claim the full production definition of done until the external adapters and upstream compatibility work are implemented and independently re-verified.
