# Architecture

## Graph

```text
candidate evidence -------------------------------┐
                                                  v
job -> normalize -> dedupe -> hard filters -> JD analysis -> evidence matching -> fit scoring
                                                              |                       |
                                                              |                       +-> skip/review
                                                              v
                                                        resume planning
                                                              v
                                                        resume generator
                                                              v
                                                   independent truth checker
                                                        |             |
                                                     reject          pass
                                                        |             |
                                                  targeted repair     v
                                                        |        PDF render/validate
                                                        +-------------|
                                                                      v
                                                               application ready
                                                                      v
                                                           duplicate/ownership gate
                                                                      v
                                                               application adapter
                                                          /            |             \
                                                     success       attention        error/
                                                        |             |            unconfirmed
                                                        v             v
                                                  confirmation   attention queue
                                                        |
                                                        v
                                                      ledger
```

## Module boundaries

- `career.mjs`: validates the canonical verified career evidence source and performs evidence matching.
- `jobs.mjs`: job normalization, URL canonicalization, requisition fingerprints and duplicate classification.
- `filters.mjs`: deterministic inexpensive gates before expensive reasoning/generation.
- `jd.mjs`: converts a job into structured requirements; current milestone uses deterministic extraction/fixture contracts.
- `scoring.mjs`: explainable dimensions, must-have coverage gate, configurable thresholds.
- `resume.mjs`: plan first, then generate provenance-linked structured resume content.
- `truth.mjs`: independent checker that rejects unsupported claims, skills, evidence IDs and metrics.
- `pdf.mjs`: deliberately boring one-column PDF renderer plus extractability validation.
- `state.mjs`: explicit job lifecycle and persistent checkpoints.
- `ledger.mjs`: append-only submission/attention records and exclusive submission ownership.
- `application/*`: adapters. `mock-ats.mjs` is the safe test boundary; live ATS adapters are the next milestone.
- `pipeline.mjs`: orchestration only. Domain decisions remain in bounded modules.

## Resume provenance

A material generated claim has this shape:

```json
{
  "text": "Built customer-facing applications with React and TypeScript.",
  "evidenceIds": ["experience_001"]
}
```

The checker receives the career database and generated resume independently. A claim with no evidence, an unknown evidence ID, an unsupported skill, or a numeric metric absent from its evidence is rejected. Repair removes/rebuilds only rejected claims and is bounded to three attempts.

## Submission semantics

A click/request is not enough to become `SUBMITTED`. An adapter must return an explicit confirmed state. Ambiguous results become `SUBMISSION_UNCONFIRMED`; CAPTCHA/legal blockers become `ATTENTION_REQUIRED`; failures become `FAILED`. The ledger is appended only for confirmed submission.
