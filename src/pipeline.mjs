import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateCareerProfile, matchEvidence } from './career.mjs';
import { normalizeJob } from './jobs.mjs';
import { hardFilter } from './filters.mjs';
import { analyzeJD } from './jd.mjs';
import { scoreFit } from './scoring.mjs';
import { planResume, generateResume, repairResume } from './resume.mjs';
import { verifyResume } from './truth.mjs';
import { renderResumePdf, validatePdf } from './pdf.mjs';
import { CheckpointStore } from './state.mjs';
import { Ledger } from './ledger.mjs';
import { ensureDir, sha256, slug, writeJson } from './utils.mjs';

export async function processJob({ rawJob, rawProfile, preferences, runDir, ats, injectUnsupportedClaim = false, crashAfter = null }) {
  await ensureDir(runDir);
  const profile = validateCareerProfile(rawProfile);
  const job = normalizeJob(rawJob);
  const checkpoints = new CheckpointStore(path.join(runDir, 'checkpoints.json'));
  const ledger = new Ledger(path.join(runDir, 'ledger'));
  const existing = await checkpoints.get(job.jobId);
  if (existing?.state === 'SUBMITTED') return { reused: true, job, state: 'SUBMITTED', checkpoint: existing };
  if (await ledger.check(job)) { await checkpoints.save(job.jobId, { state: 'SUBMITTED', reconciled: true }); return { reused: true, job, state: 'SUBMITTED' }; }

  await checkpoints.save(job.jobId, { state: 'NORMALIZED', job });
  const filter = hardFilter(job, preferences, profile);
  if (!filter.pass) { await checkpoints.save(job.jobId, { state: 'FILTERED_OUT', filter }); return { job, state: 'FILTERED_OUT', filter }; }

  const analysis = existing?.analysis || analyzeJD(job);
  const matched = existing?.matched || matchEvidence(profile, analysis.requirements);
  const assessment = existing?.assessment || scoreFit({ job, analysis, matchedRequirements: matched, preferences });
  if (assessment.route === 'skip') { await checkpoints.save(job.jobId, { state: 'FILTERED_OUT', analysis, matched, assessment }); return { job, state: 'FILTERED_OUT', assessment }; }
  await checkpoints.save(job.jobId, { state: 'QUALIFIED', analysis, matched, assessment });
  if (crashAfter === 'assessment') throw new Error('INJECTED_CRASH_AFTER_ASSESSMENT');

  const plan = existing?.plan || planResume({ profile, job, matchedRequirements: matched });
  await checkpoints.save(job.jobId, { state: 'RESUME_PLANNED', plan });
  let resume = existing?.resume || generateResume({ profile, job, plan, injectUnsupportedClaim });
  let verification = verifyResume({ profile, resume });
  let attempts = 1;
  while (verification.verdict === 'reject' && attempts < 3) {
    await checkpoints.save(job.jobId, { state: 'RESUME_REJECTED', verification, attempts });
    resume = repairResume(resume, verification);
    verification = verifyResume({ profile, resume });
    attempts += 1;
  }
  if (verification.verdict !== 'pass') { await checkpoints.save(job.jobId, { state: 'FAILED', verification, attempts }); return { job, state: 'FAILED', verification }; }
  await checkpoints.save(job.jobId, { state: 'RESUME_VERIFIED', resume, verification, attempts });
  if (crashAfter === 'verification') throw new Error('INJECTED_CRASH_AFTER_VERIFICATION');

  const artifactDir = path.join(runDir, 'generated', `${slug(job.company)}-${slug(job.title)}-${job.jobId}`);
  const resumePath = path.join(artifactDir, 'resume.pdf');
  await renderResumePdf(resume, resumePath);
  const pdf = await validatePdf(resumePath, resume);
  if (!pdf.valid) { await checkpoints.save(job.jobId, { state: 'FAILED', pdf }); return { job, state: 'FAILED', pdf }; }
  const resumeHash = sha256(await readFile(resumePath));
  await writeJson(path.join(artifactDir, 'resume.json'), resume);
  await writeJson(path.join(artifactDir, 'verification.json'), verification);
  await writeJson(path.join(artifactDir, 'plan.json'), plan);
  await checkpoints.save(job.jobId, { state: 'APPLICATION_READY', resumePath, resumeHash, pdf });

  const ownership = await ledger.acquire(job);
  if (!ownership.owned) return { job, state: 'ATTENTION_REQUIRED', reason: 'SUBMISSION_OWNERSHIP_HELD' };
  try {
    if (await ledger.check(job)) return { job, state: 'SUBMITTED', reused: true };
    await checkpoints.save(job.jobId, { state: 'APPLICATION_IN_PROGRESS' });
    if (crashAfter === 'application-open') throw new Error('INJECTED_CRASH_AFTER_APPLICATION_OPEN');
    const result = await ats.submit({ job, profile, resumePath });
    if (result.status === 'attention') { await ledger.addAttention(job, result.reason); await checkpoints.save(job.jobId, { state: 'ATTENTION_REQUIRED', reason: result.reason }); return { job, state: 'ATTENTION_REQUIRED', reason: result.reason }; }
    if (result.status === 'unconfirmed') { await checkpoints.save(job.jobId, { state: 'SUBMISSION_UNCONFIRMED' }); return { job, state: 'SUBMISSION_UNCONFIRMED' }; }
    if (result.status !== 'submitted') { await checkpoints.save(job.jobId, { state: 'FAILED', reason: result.reason }); return { job, state: 'FAILED', reason: result.reason }; }
    const row = await ledger.addSubmitted({ job, resumePath, resumeHash, confirmation: result.confirmation, assessment });
    await checkpoints.save(job.jobId, { state: 'SUBMITTED', ledger: row });
    return { job, state: 'SUBMITTED', assessment, plan, resume, verification, pdf, ledger: row, attempts };
  } finally { await ownership.release(); }
}
