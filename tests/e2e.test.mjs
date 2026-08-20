import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processJob } from '../src/pipeline.mjs';
import { MockATS } from '../src/application/mock-ats.mjs';

const profile = {
  identity: { name:'Example Candidate', email:'candidate@example.com', location:'India' },
  evidence: [
    { id:'react', fact:'Built customer-facing applications with React and TypeScript.', skills:['React','TypeScript'], verified:true },
    { id:'node', fact:'Built backend APIs with Node.js and PostgreSQL.', skills:['Node.js','PostgreSQL'], verified:true }
  ]
};
const prefs = { targetTitles:['Full Stack','Software Engineer'], targetSkills:['React','Node.js'], workModes:['remote'], employmentTypes:['full-time'], thresholds:{manual:70,auto:80} };
const goodJob = { company:'Acme', title:'Full Stack Engineer', canonicalUrl:'https://jobs.test/acme/123?utm_source=x', applicationUrl:'https://jobs.test/acme/123', externalId:'123', workMode:'remote', employmentType:'full-time', status:'active', description:'React Node.js TypeScript', requirements:[{requirement:'React',kind:'must-have',skills:['React']},{requirement:'Node.js',kind:'must-have',skills:['Node.js']}] };

async function runDir(prefix) { return await mkdtemp(path.join(os.tmpdir(), prefix)); }

test('positive E2E: evidence -> resume -> PDF -> mock ATS -> confirmed ledger', async () => {
  const dir = await runDir('job-e2e-ok-'); const ats = new MockATS('success');
  const result = await processJob({ rawJob:goodJob, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(result.state,'SUBMITTED'); assert.equal(result.verification.verdict,'pass'); assert.equal(result.pdf.valid,true); assert.equal(ats.received.length,1);
  assert.equal(ats.received[0].resumeHash, result.ledger.resume.hash);
  const ledger = await readFile(path.join(dir,'ledger','applications.ndjson'),'utf8'); assert.match(ledger,/"status":"submitted"/);
});

test('negative E2E: critical missing must-haves prevents resume/application', async () => {
  const dir = await runDir('job-e2e-skip-'); const ats = new MockATS('success');
  const job = { ...goodJob, externalId:'missing', canonicalUrl:'https://jobs.test/acme/missing', applicationUrl:'https://jobs.test/acme/missing', requirements:[
    {requirement:'Kubernetes',kind:'must-have',skills:['Kubernetes']}, {requirement:'GraphQL',kind:'must-have',skills:['GraphQL']}, {requirement:'AWS',kind:'must-have',skills:['AWS']}, {requirement:'React',kind:'must-have',skills:['React']}
  ] };
  const result = await processJob({ rawJob:job, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(result.state,'FILTERED_OUT'); assert.equal(ats.received.length,0);
});

test('attention E2E: CAPTCHA routes to attention without false submission', async () => {
  const dir = await runDir('job-e2e-attn-'); const ats = new MockATS('captcha');
  const result = await processJob({ rawJob:{...goodJob,externalId:'cap',canonicalUrl:'https://jobs.test/acme/cap',applicationUrl:'https://jobs.test/acme/cap'}, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(result.state,'ATTENTION_REQUIRED'); assert.equal(result.reason,'CAPTCHA');
  const attention = await readFile(path.join(dir,'ledger','attention.ndjson'),'utf8'); assert.match(attention,/CAPTCHA/);
});

test('resume repair E2E removes unsupported generated claim before application', async () => {
  const dir = await runDir('job-e2e-repair-'); const ats = new MockATS('success');
  const result = await processJob({ rawJob:{...goodJob,externalId:'repair',canonicalUrl:'https://jobs.test/acme/repair',applicationUrl:'https://jobs.test/acme/repair'}, rawProfile:profile, preferences:prefs, runDir:dir, ats, injectUnsupportedClaim:true });
  assert.equal(result.state,'SUBMITTED'); assert.equal(result.attempts,2); assert.equal(result.verification.verdict,'pass');
  assert.ok(!result.resume.claims.some((x) => x.text.includes('47%')));
});

test('restart E2E reuses completed expensive work and never resubmits confirmed job', async () => {
  const dir = await runDir('job-e2e-restart-');
  await assert.rejects(() => processJob({ rawJob:{...goodJob,externalId:'restart',canonicalUrl:'https://jobs.test/acme/restart',applicationUrl:'https://jobs.test/acme/restart'}, rawProfile:profile, preferences:prefs, runDir:dir, ats:new MockATS('success'), crashAfter:'verification' }), /INJECTED_CRASH/);
  const ats = new MockATS('success');
  const first = await processJob({ rawJob:{...goodJob,externalId:'restart',canonicalUrl:'https://jobs.test/acme/restart',applicationUrl:'https://jobs.test/acme/restart'}, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(first.state,'SUBMITTED'); assert.equal(ats.received.length,1);
  const second = await processJob({ rawJob:{...goodJob,externalId:'restart',canonicalUrl:'https://jobs.test/acme/restart',applicationUrl:'https://jobs.test/acme/restart'}, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(second.state,'SUBMITTED'); assert.equal(second.reused,true); assert.equal(ats.received.length,1);
});

test('ambiguous submission is never recorded as submitted', async () => {
  const dir = await runDir('job-e2e-amb-'); const ats = new MockATS('ambiguous');
  const result = await processJob({ rawJob:{...goodJob,externalId:'amb',canonicalUrl:'https://jobs.test/acme/amb',applicationUrl:'https://jobs.test/acme/amb'}, rawProfile:profile, preferences:prefs, runDir:dir, ats });
  assert.equal(result.state,'SUBMISSION_UNCONFIRMED');
  await assert.rejects(readFile(path.join(dir,'ledger','applications.ndjson'),'utf8'), /ENOENT/);
});
