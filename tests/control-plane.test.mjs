import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { discoverGreenhouse, discoverLever, discoverAshby } from '../src/discovery/adapters.mjs';
import { JobStore } from '../src/job-store.mjs';
import { processJob } from '../src/pipeline.mjs';
import { MockATS } from '../src/application/mock-ats.mjs';
import { JobControlPlane } from '../src/control-plane.mjs';
import { createControlPlaneServer } from '../src/control-plane-server.mjs';
import { sha256 } from '../src/utils.mjs';

const profile = {
  version: 'test-v1',
  identity: { name: 'Test Candidate', email: 'jobs@example.com', phone: '+910000000000', location: 'India' },
  eligibility: { authorizations: ['India'] },
  education: [],
  evidence: [
    { id: 'react', type: 'experience-bullet', fact: 'Built product experiences with React and TypeScript.', skills: ['React','TypeScript'], verified: true },
    { id: 'node', type: 'experience-bullet', fact: 'Built backend services using Node.js.', skills: ['Node.js'], verified: true }
  ]
};
const preferences = {
  targetTitles: ['Full Stack'], targetSkills: ['React','Node.js','TypeScript'], excludedCompanies: [],
  workModes: ['remote'], employmentTypes: ['full-time'], thresholds: { manual: 70, auto: 80 }
};
const job = {
  company: 'Acme Labs', title: 'Full Stack Engineer', canonicalUrl: 'https://jobs.example.test/acme/123',
  applicationUrl: 'https://jobs.example.test/acme/123', externalId: 'ACME-123', source: 'fixture',
  description: 'Build product experiences with React, TypeScript and Node.js.', locations: ['Remote'],
  workMode: 'remote', employmentType: 'full-time', status: 'active',
  requirements: [
    { requirement: 'React production experience', kind: 'must-have', skills: ['React'] },
    { requirement: 'Node.js production experience', kind: 'must-have', skills: ['Node.js'] },
    { requirement: 'TypeScript experience', kind: 'must-have', skills: ['TypeScript'] }
  ]
};
const fakeResponse = (payload) => ({ ok: true, json: async () => payload });

const createFixtureControl = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'control-plane-'));
  const profileFile = path.join(dir, 'profile.json');
  const preferencesFile = path.join(dir, 'preferences.json');
  const sourcesFile = path.join(dir, 'sources.json');
  await writeFile(profileFile, JSON.stringify(profile));
  await writeFile(preferencesFile, JSON.stringify(preferences));
  await writeFile(sourcesFile, JSON.stringify([{ kind: 'json-feed', company: 'Acme Labs', url: 'https://feed.test/jobs' }]));
  const ats = new MockATS('success');
  const fetchImpl = async () => fakeResponse([job]);
  const control = new JobControlPlane({ stateDir: path.join(dir, 'state'), profileFile, preferencesFile, sourcesFile, ats, fetchImpl });
  return { dir, ats, control };
};

test('public ATS discovery adapters normalize Greenhouse, Lever and Ashby', async () => {
  const greenhouse = await discoverGreenhouse(
    { kind:'greenhouse', company:'Acme', boardToken:'acme' },
    async () => fakeResponse({ jobs:[{ id:1, title:'Full Stack Engineer', absolute_url:'https://boards.greenhouse.io/acme/jobs/1', content:'<p>React Node.js</p>', location:{name:'Remote'} }] })
  );
  assert.equal(greenhouse[0].company, 'Acme');
  assert.match(greenhouse[0].description, /React Node\.js/);
  const lever = await discoverLever(
    { kind:'lever', company:'Beta', site:'beta' },
    async () => fakeResponse([{ id:'l1', text:'Product Engineer', hostedUrl:'https://jobs.lever.co/beta/l1', applyUrl:'https://jobs.lever.co/beta/l1/apply', categories:{location:'Remote',commitment:'full-time'}, descriptionPlain:'TypeScript' }])
  );
  assert.equal(lever[0].externalId, 'l1');
  const ashby = await discoverAshby(
    { kind:'ashby', company:'Gamma', boardName:'gamma' },
    async () => fakeResponse({ jobs:[{ id:'a1', title:'Software Engineer', jobUrl:'https://jobs.ashbyhq.com/gamma/a1', applyUrl:'https://jobs.ashbyhq.com/gamma/a1/application', location:'Remote', descriptionHtml:'<b>React</b>', isListed:true }] })
  );
  assert.equal(ashby[0].company, 'Gamma');
});

test('job store remembers jobs and approval state without duplicate insertion', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'job-store-'));
  const store = new JobStore(dir);
  const normalized = { ...job, jobId:'job-1', canonicalUrl:job.canonicalUrl, externalId:job.externalId };
  const first = await store.upsertDiscovered([normalized]);
  const second = await store.upsertDiscovered([normalized]);
  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);
  await store.patch('job-1', { crmStatus:'AWAITING_APPROVAL' });
  await store.approve(['job-1']);
  assert.equal((await store.get('job-1')).crmStatus, 'APPROVED');
});

test('prepare-only pipeline generates and verifies a resume but never submits', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'prepare-only-'));
  const ats = new MockATS('success');
  const result = await processJob({ rawJob:job, rawProfile:profile, preferences, runDir, ats, submissionMode:'prepare-only' });
  assert.equal(result.state, 'AWAITING_APPROVAL');
  assert.equal(result.verification.verdict, 'pass');
  assert.equal(ats.received.length, 0);
  assert.ok(result.resumePath);
  assert.ok((await readFile(result.resumePath)).length > 0);
});

test('control plane gates submission until explicit approval', async () => {
  const { ats, control } = await createFixtureControl();
  const runAll = await control.runAll({ prepareLimit:10 });
  assert.equal(runAll.gate, 'AWAITING_APPROVAL');
  assert.equal(ats.received.length, 0);
  assert.equal((await control.jobs.list({ statuses:['AWAITING_APPROVAL'] })).length, 1);
  await control.approve('all');
  const apply = await control.applyApproved({ limit:10 });
  assert.equal(apply.results[0].state, 'SUBMITTED');
  assert.equal(ats.received.length, 1);
  assert.equal((await control.snapshot()).summary.submitted, 1);
});

test('approved jobs without a reviewed resume hash fail closed', async () => {
  const { ats, control } = await createFixtureControl();
  await control.runAll({ prepareLimit:10 });
  const [prepared] = await control.jobs.list({ statuses:['AWAITING_APPROVAL'] });
  await control.approve([prepared.jobId]);
  await control.jobs.patch(prepared.jobId, { resumeHash:null });
  const apply = await control.applyApproved({ limit:10 });
  assert.equal(apply.results[0].state, 'ATTENTION_REQUIRED');
  assert.equal(apply.results[0].reason, 'REVIEWED_RESUME_HASH_MISSING');
  assert.equal(ats.received.length, 0);
  assert.equal((await control.jobs.get(prepared.jobId)).crmStatus, 'ATTENTION_REQUIRED');
});

test('resume ticket returns a direct hash-verified PDF URL without browser auth headers', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'resume-ticket-'));
  const resumePath = path.join(dir, 'resume.pdf');
  const bytes = Buffer.from('%PDF-1.7\nreviewed resume bytes\n%%EOF');
  await writeFile(resumePath, bytes);
  const jobId = 'job-ticket-1';
  const control = {
    jobs: { get: async (id) => id === jobId ? { jobId, resumePath, resumeHash:sha256(bytes) } : null }
  };
  const server = createControlPlaneServer({ control, controlToken:'secret' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const mint = await fetch(`${base}/api/resume-ticket`, {
    method:'POST',
    headers:{ 'content-type':'application/json', 'x-job-apply-token':'secret' },
    body:JSON.stringify({ jobId })
  });
  assert.equal(mint.status, 200);
  const ticket = await mint.json();
  assert.match(ticket.url, new RegExp(`/api/resume/${jobId}\\?ticket=`));

  const wrong = await fetch(`${base}/api/resume/${jobId}?ticket=wrong`);
  assert.equal(wrong.status, 401);

  const preview = await fetch(ticket.url);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'application/pdf');
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(previewBytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(sha256(previewBytes), sha256(bytes));
});
