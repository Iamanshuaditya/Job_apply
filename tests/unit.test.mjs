import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCareerProfile } from '../src/career.mjs';
import { canonicalizeUrl, normalizeJob, classifyDuplicate, jobFingerprint } from '../src/jobs.mjs';
import { hardFilter } from '../src/filters.mjs';
import { analyzeJD } from '../src/jd.mjs';
import { matchEvidence } from '../src/career.mjs';
import { scoreFit } from '../src/scoring.mjs';
import { planResume, generateResume } from '../src/resume.mjs';
import { verifyResume } from '../src/truth.mjs';
import { renderResumePdf, validatePdf } from '../src/pdf.mjs';
import { transition } from '../src/state.mjs';
import { Ledger } from '../src/ledger.mjs';

const profile = validateCareerProfile({
  identity: { name: 'A', email: 'a@example.com' },
  evidence: [
    { id: 'e1', fact: 'Built React interfaces with TypeScript.', skills: ['React','TypeScript'], verified: true },
    { id: 'e2', fact: 'Built Node.js APIs with PostgreSQL.', skills: ['Node.js','PostgreSQL'], verified: true }
  ]
});
const prefs = { targetTitles: ['Full Stack'], targetSkills: ['React','Node.js'], workModes: ['remote'], employmentTypes: ['full-time'] };
const rawJob = { company:'Acme', title:'Full Stack Engineer', canonicalUrl:'https://jobs.test/acme/1?utm_source=x', applicationUrl:'https://jobs.test/acme/1', externalId:'1', workMode:'remote', employmentType:'full-time', status:'active', requirements:[{requirement:'React',kind:'must-have',skills:['React']},{requirement:'Node.js',kind:'must-have',skills:['Node.js']}] };

test('canonical URL strips tracking params', () => assert.equal(canonicalizeUrl(rawJob.canonicalUrl), 'https://jobs.test/acme/1'));

test('career profile rejects unverified evidence', () => assert.throws(() => validateCareerProfile({ identity:{name:'A'}, evidence:[{id:'x',fact:'x',skills:[],verified:false}] }), /explicitly verified/));

test('duplicate classification distinguishes same requisition', () => {
  const job = normalizeJob(rawJob);
  const prior = [{ fingerprint: jobFingerprint(job), jobId: job.jobId, company:job.company, title:job.title }];
  assert.deepEqual(classifyDuplicate(job, prior).kind, 'same-posting');
});

test('hard filter runs before expensive work', () => {
  const job = normalizeJob({ ...rawJob, company:'Blocked Co' });
  const result = hardFilter(job, { ...prefs, excludedCompanies:['Blocked Co'] }, profile);
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes('excluded-company'));
});

test('fit score is explainable and bounded', () => {
  const job = normalizeJob(rawJob); const analysis = analyzeJD(job); const matched = matchEvidence(profile, analysis.requirements);
  const result = scoreFit({ job, analysis, matchedRequirements:matched, preferences:prefs });
  assert.equal(result.score, 100); assert.equal(result.route, 'qualified'); assert.equal(result.mustHaveCoverage, 1);
});

test('truth checker rejects invented metrics and unsupported claims', () => {
  const job = normalizeJob(rawJob); const analysis = analyzeJD(job); const matched = matchEvidence(profile, analysis.requirements);
  const plan = planResume({ profile, job, matchedRequirements:matched });
  const resume = generateResume({ profile, job, plan, injectUnsupportedClaim:true });
  const report = verifyResume({ profile, resume });
  assert.equal(report.verdict, 'reject');
  assert.ok(report.issues.some((x) => x.type === 'unsupported-claim'));
});

test('illegal state transitions fail loudly', () => assert.throws(() => transition('DISCOVERED','SUBMITTED'), /illegal transition/));

test('real PDF is emitted and expected text is extractable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'job-pdf-'));
  const job = normalizeJob(rawJob); const analysis = analyzeJD(job); const matched = matchEvidence(profile, analysis.requirements);
  const plan = planResume({ profile, job, matchedRequirements:matched }); const resume = generateResume({ profile, job, plan });
  const file = path.join(dir,'resume.pdf'); await renderResumePdf(resume,file); const report = await validatePdf(file,resume);
  assert.equal(report.valid,true); assert.equal(report.pages,1); assert.ok(report.text.includes('TECHNICAL SKILLS'));
  assert.equal((await readFile(file)).subarray(0,8).toString(), '%PDF-1.4');
});

test('submission ownership is exclusive under concurrency', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'job-lock-')); const ledger = new Ledger(dir); const job = normalizeJob(rawJob);
  const [a,b] = await Promise.all([ledger.acquire(job), ledger.acquire(job)]);
  assert.equal(Number(a.owned) + Number(b.owned), 1);
  await a.release(); await b.release();
});
