# Job Apply — Twenty CRM Job Search Agent

Twenty CRM is the operating console for an evidence-first job-application system.

```text
Candidate Profile + Career Evidence + Exclusions + Job Sources
                         │
                      Run All
                         ▼
Discovery → normalize → dedupe → hard filters → JD analysis → fit
                         ▼
Resume plan → generate → truth checker → PDF validation
                         ▼
                 AWAITING APPROVAL
             company + fit + exact PDF
                  /              \
              Reject           Approve
                                  ▼
                         Apply All Approved
                                  ▼
                         browser application queue
                      /          |             \
                 Submitted    Attention     Unconfirmed/Failed
```

## CRM workspace

The private Twenty app is in `apps/twenty-job-search-crm`. It adds:

- **Job Search Dashboard** — Run All, review queue, approve/reject, Apply All Approved, live counts.
- **Candidate Profile** — base resume, application email, phone, location, LinkedIn, GitHub, portfolio, current company, “What I do,” work progress, knowledge base, filters and authorization.
- **Career Evidence** — explicitly verified work experience, projects, skills, achievements, education and certifications. Only these verified rows may create resume claims.
- **Job Sources** — Greenhouse, Lever, Ashby and custom JSON feeds.
- **Excluded Companies** — permanent do-not-apply list with aliases. Current company is automatically excluded.
- **Jobs** — discovered jobs and lifecycle: discovered, filtered, awaiting approval, approved, queued/applying, submitted, attention, failed/closed.
- **Resume Variants** — per-job verification/hash metadata. The dashboard streams the exact PDF prepared for the job.

## Safety contract

`Run All` never submits. It discovers, filters, scores, generates a tailored resume from verified evidence, validates it, and stops at `AWAITING_APPROVAL`.

Before applying, the dashboard shows the company, role, fit score and **Preview exact PDF**. Approval is separate. `Apply All Approved` starts the side-effecting browser queue.

The reviewed PDF SHA-256 is passed into the application stage. If the resume changes after review, submission stops as `REVIEWED_RESUME_HASH_CHANGED` instead of sending an unseen file.

The browser adapter routes CAPTCHA, legal attestations, sensitive government identifiers, unsupported required fields and ambiguous submission confirmations to attention. `SUBMITTED` is recorded only after visible success evidence.

## New-job discovery and dedupe

The control plane includes live read-only discovery adapters for:

- Greenhouse Job Board API
- Lever Postings API
- Ashby public Job Board API
- custom JSON feeds

`.job-apply/jobs.json` remembers every discovered `jobId`, first/last seen timestamps, approval and application status. Requisition IDs/canonical URLs are also protected by the append-only application ledger and exclusive submission locks, so repeated daily discovery does not create duplicate applications.

## Setup

### Job Apply control plane

Requires Node.js 22+.

```bash
npm install
npm run browser:install
cp candidate/profile.example.json candidate/profile.json
cp candidate/preferences.example.json candidate/preferences.json
cp config/sources.example.json config/sources.json

export JOB_APPLY_HOST=0.0.0.0
export JOB_APPLY_CONTROL_TOKEN='replace-with-a-long-random-secret'
export JOB_APPLY_ALLOW_SUBMIT=false
npm run control-plane
```

The server listens on port `4310` by default. Keep `JOB_APPLY_ALLOW_SUBMIT=false` while configuring/testing. Set it to `true` only when you intentionally want Apply All Approved to press final submit buttons.

Optional discovery-only scheduler (never submits):

```bash
JOB_APPLY_DISCOVERY_INTERVAL_MINUTES=240 npm run discover:daemon
```

### Twenty app

Twenty app development uses Node.js 24+ and Yarn 4.

```bash
cd apps/twenty-job-search-crm
corepack enable
yarn install
yarn twenty remote add --local
yarn twenty dev
```

Configure the private app variables in Twenty:

```text
JOB_APPLY_ORCHESTRATOR_URL=http://host.docker.internal:4310
JOB_APPLY_ORCHESTRATOR_TOKEN=<same token as JOB_APPLY_CONTROL_TOKEN>
```

Then create one Candidate Profile, add verified Career Evidence, add exclusions and Job Sources, open Job Search Dashboard, and click **Run All**.

## Validation

```bash
npm run validate
npm run test:e2e
npm run test:scale
npm run test:control-plane

cd apps/twenty-job-search-crm
yarn typecheck
yarn lint
yarn twenty build
```

`LOOP.md`, `STATE.md` and `RUNLOG.md` record verified state and remaining production boundaries.
