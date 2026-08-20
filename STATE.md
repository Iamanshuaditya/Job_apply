# STATE.md

## Verified current state
- Candidate career evidence remains the only resume-claim source; profile context is stored separately and cannot silently become resume evidence.
- Job normalization, URL canonicalization, company aliases/exclusions, JD analysis, evidence matching, explainable scoring, resume planning, independent truth verification, bounded repair, ATS-safe PDF rendering/validation, checkpoints, submission ownership and append-only ledger are implemented.
- Live read-only discovery adapters exist for Greenhouse, Lever, Ashby and configurable JSON feeds, with a persistent seen-job store so daily runs do not reprocess the same posting as new.
- The workflow has an explicit human approval boundary: `Run All` ends in `AWAITING_APPROVAL`; `Apply All Approved` is a separate action.
- The exact reviewed resume SHA-256 is carried into the application step. A changed resume is blocked as `REVIEWED_RESUME_HASH_CHANGED`.
- A Playwright browser adapter fills deterministic identity fields, uploads the reviewed resume and requires visible success evidence before recording `SUBMITTED`. CAPTCHA, legal/sensitive questions, unsupported required fields and ambiguous confirmation route to attention instead of being guessed.
- A Twenty CRM app exists under `apps/twenty-job-search-crm` with Candidate Profile, Career Evidence, Job Sources, Excluded Companies, Jobs, Resume Variants, Automation Runs, Application History and Attention objects plus a CRM-native control dashboard.
- Control-plane tests verify discovery normalization, persistent job memory, prepare-without-submit, explicit approval, Apply All, and confirmed ledger state.
- The purpose-built UI preview has been visually inspected at 1440×1000 and follows Twenty's restrained CRM visual language.

## External boundaries still requiring environment-specific verification
- Each real employer/ATS can introduce custom fields and DOM flows; the generic Playwright adapter deliberately routes unsupported forms to Attention. Site-specific adapters should be added from observed failures rather than guessed.
- Final-submit automation is disabled unless `JOB_APPLY_ALLOW_SUBMIT=true`.
- A running Twenty instance is required to publish/install the private app and validate workspace-specific API permissions and generated schema names.
- OS-backed storage for sensitive candidate configuration and a production LLM provider/cost layer remain future hardening work.

## Completion status
The CRM control plane, review gate, discovery layer and generic browser application queue are implemented and locally verified. Do not claim universal production coverage for every ATS until those real-site flows have been exercised with authorized targets.
