import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCareerProfile } from '../src/career.mjs';
import { canonicalizeUrl, normalizeJob, classifyDuplicate, jobFingerprint } from '../src/jobs.mjs';
import { hardFilter } from '../src/filters.mjs';
import { analyzeJD, inferRoleFamily } from '../src/jd.mjs';
import { matchEvidence } from '../src/career.mjs';
import { scoreFit } from '../src/scoring.mjs';
import { planResume, generateResume } from '../src/resume.mjs';
import { verifyResume } from '../src/truth.mjs';
import { renderResumePdf, validatePdf } from '../src/pdf.mjs';
import { transition } from '../src/state.mjs';
import { Ledger } from '../src/ledger.mjs';
import { mergeProfileConfig } from '../src/control-plane.mjs';

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

test('job URLs fail closed unless they use HTTPS', () => {
  assert.throws(() => canonicalizeUrl('http://jobs.test/acme/1'), /https/);
  assert.throws(() => canonicalizeUrl('javascript:alert(1)'), /https/);
  assert.throws(() => canonicalizeUrl('data:text/html,hello'), /https/);
});

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

test('hard filter enforces country and company-size metadata when available', () => {
  const job = normalizeJob({ ...rawJob, country:'India', companySize:'51-200' });
  const result = hardFilter(job, { ...prefs, countries:['India'], maxCompanySize:50 }, profile);
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes('company-size'));
  const country = hardFilter(normalizeJob({ ...rawJob, externalId:'2', canonicalUrl:'https://jobs.test/acme/2', applicationUrl:'https://jobs.test/acme/2', country:'United States', companySize:'11-50' }), { ...prefs, countries:['India'], maxCompanySize:50 }, profile);
  assert.ok(country.reasons.includes('country'));
});

test('fit score is explainable and bounded', () => {
  const job = normalizeJob(rawJob); const analysis = analyzeJD(job); const matched = matchEvidence(profile, analysis.requirements);
  const result = scoreFit({ job, analysis, matchedRequirements:matched, preferences:prefs });
  assert.equal(result.score, 100); assert.equal(result.route, 'qualified'); assert.equal(result.mustHaveCoverage, 1);
  assert.equal(result.dimensions.roleAlignment.applicable, true);
});

test('non-engineering role family is hard-gated from engineering targets', () => {
  const job = normalizeJob({ ...rawJob, title:'Senior Manager, Growth Marketing', externalId:'marketing', canonicalUrl:'https://jobs.test/acme/marketing', applicationUrl:'https://jobs.test/acme/marketing', description:'Lead growth marketing strategy, campaigns, lifecycle marketing and brand.', requirements:[] });
  const analysis = analyzeJD(job); const matched = matchEvidence(profile, analysis.requirements);
  const result = scoreFit({ job, analysis, matchedRequirements:matched, preferences:prefs });
  assert.equal(analysis.roleFamily, 'marketing');
  assert.equal(result.route, 'skip');
  assert.ok(result.hardFailures.some((failure) => failure.includes('role-family-mismatch')));
});

test('full-stack JDs are not shadowed by frontend/backend keywords', () => {
  assert.equal(inferRoleFamily('Full Stack Developer | React frontend and Node backend'), 'full-stack');
  assert.equal(inferRoleFamily('Fullstack Engineer, Product Team | build APIs and React on the frontend'), 'full-stack');
  assert.equal(inferRoleFamily('Backend Engineer | Node.js APIs'), 'backend');
});

test('resume planning preserves breadth and canonical technical skill groups', () => {
  const richProfile = validateCareerProfile({ identity:{name:'A'}, evidence:[
    {id:'r1',fact:'Built React product UI.',skills:['React','React.js','TypeScript'],verified:true,type:'experience',organization:'SyntaxErreur',period:'Mar 2025 - Present'},
    {id:'r2',fact:'Built Node.js services.',skills:['Node.js','REST','Microservices'],verified:true,type:'experience',organization:'PivotMind',period:'Jan 2025 - Mar 2025'},
    {id:'r3',fact:'Deployed workloads on AWS.',skills:['AWS'],verified:true,type:'project',organization:'Cloud Project'},
    {id:'r4',fact:'Designed SQL and PostgreSQL schemas.',skills:['SQL','PostgreSQL'],verified:true,type:'project',organization:'Database Project'},
    {id:'r5',fact:'Won a product hackathon.',skills:[],verified:true,type:'achievement'},
    {id:'r6',fact:'Won a university coding challenge.',skills:[],verified:true,type:'achievement'},
    {id:'r8',fact:'Placed in the top one percent by CGPA.',skills:[],verified:true,type:'achievement'},
    {id:'r7',fact:'Automated browser tests with Playwright.',skills:['Playwright'],verified:true,type:'experience',organization:'SyntaxErreur'}
  ]});
  const job = normalizeJob({ ...rawJob, requirements:[{requirement:'React',kind:'must-have',skills:['React']}] });
  const analysis = analyzeJD(job); const matched = matchEvidence(richProfile, analysis.requirements);
  const plan = planResume({ profile:richProfile, job, matchedRequirements:matched });
  assert.ok(plan.evidenceIds.length >= 7);
  for (const id of ['r1','r2','r5','r6','r8']) assert.ok(plan.evidenceIds.includes(id));
  assert.equal(plan.skillOrder.filter((skill) => skill.toLowerCase().startsWith('react')).length, 1);
  assert.ok(plan.skillGroups.Databases.includes('SQL'));
  assert.ok(plan.skillGroups['APIs / Architecture'].includes('REST'));
  assert.ok(plan.skillGroups['APIs / Architecture'].includes('Microservices'));
  const resume = generateResume({ profile:richProfile, job, plan });
  assert.equal(resume.experience.some((claim) => claim.organization === 'PivotMind'), true);
  assert.equal(resume.projects.length, 2);
  assert.equal(resume.achievements.length, 3);
  assert.equal(resume.experience.find((claim) => claim.organization === 'SyntaxErreur')?.period, 'Mar 2025 - Present');
});

test('CRM profile merge preserves stable IDs and ignores empty projected values', () => {
  const existing = {
    version:'anshu-v1',
    identity:{name:'A',email:'old@example.com',phone:'+910000000000'},
    context:{professionalSummary:'Hand-authored summary'},
    eligibility:{authorizations:['India']},
    education:[{degree:'BCA',institution:'Example University',period:'2025 - 2028'}],
    evidence:[{id:'hand-1',title:'Engineer',type:'experience',organization:'SyntaxErreur',fact:'Built React product UI.',period:'Mar 2025 - Present',skills:['React'],verified:true}]
  };
  const incoming = {
    version:'twenty-sync-1',
    identity:{name:'A',email:'new@example.com',phone:''},
    context:{professionalSummary:''},
    eligibility:{authorizations:[]},
    education:[],
    evidence:[{id:'crm-1',title:'Engineer',type:'experience',organization:'SyntaxErreur',fact:'Built React product UI.',skills:['React','TypeScript'],verified:true}]
  };
  const merged = mergeProfileConfig(existing,incoming);
  assert.equal(merged.version,'anshu-v1');
  assert.equal(merged.crmProjectionVersion,'twenty-sync-1');
  assert.equal(merged.identity.email,'new@example.com');
  assert.equal(merged.identity.phone,'+910000000000');
  assert.equal(merged.context.professionalSummary,'Hand-authored summary');
  assert.deepEqual(merged.eligibility.authorizations,['India']);
  assert.equal(merged.education[0].period,'2025 - 2028');
  assert.equal(merged.evidence.length,1);
  assert.equal(merged.evidence[0].id,'hand-1');
  assert.equal(merged.evidence[0].period,'Mar 2025 - Present');
  assert.deepEqual(merged.evidence[0].skills,['React','TypeScript']);
});

test('Twenty metadata avoids reserved names and retains targeting/resume fields', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const [evidenceObject,resumeObject,sourceObject,syncCrm] = await Promise.all([
    readFile(path.join(root,'apps/twenty-job-search-crm/src/objects/career-evidence.object.ts'),'utf8'),
    readFile(path.join(root,'apps/twenty-job-search-crm/src/objects/resume-variant.object.ts'),'utf8'),
    readFile(path.join(root,'apps/twenty-job-search-crm/src/objects/job-source.object.ts'),'utf8'),
    readFile(path.join(root,'apps/twenty-job-search-crm/src/logic-functions/utils/sync-crm.ts'),'utf8')
  ]);
  assert.match(evidenceObject,/name:\s*'evidenceType'/);
  assert.match(evidenceObject,/name:\s*'period'/);
  assert.match(evidenceObject,/name:\s*'location'/);
  assert.doesNotMatch(evidenceObject,/name:\s*'type'/);
  assert.match(resumeObject,/name:\s*'targetRole'/);
  assert.match(resumeObject,/name:\s*'generatedAt'/);
  assert.doesNotMatch(resumeObject,/name:\s*'createdAt'/);
  assert.match(sourceObject,/name:\s*'country'/);
  assert.match(sourceObject,/name:\s*'companySize'/);
  assert.match(syncCrm,/country:\s*true/);
  assert.match(syncCrm,/companySize:\s*true/);
  assert.match(syncCrm,/period:\s*true/);
  assert.match(syncCrm,/location:\s*true/);
  for (const value of ['GREENHOUSE','LEVER','ASHBY','JSON_FEED']) assert.match(sourceObject,new RegExp(`value:\\s*'${value}'`));
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

test('real PDF is emitted with Jake-style sections, dates and de-duplicated projects', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'job-pdf-'));
  const pdfProfile = validateCareerProfile({
    identity:{name:'Résumé Candidate',email:'resume@example.com'},
    education:[{degree:'BCA',institution:'Example University',period:'2025 - 2028'}],
    evidence:[
      {id:'long',fact:'Built a customer-facing TypeScript and React workflow with a deliberately long evidence sentence that must wrap inside the printable page instead of overflowing beyond the right margin.',skills:['React','TypeScript'],verified:true,type:'experience',organization:'Acme',title:'Full Stack Engineer',period:'Mar 2025 - Present',location:'Remote'},
      {id:'api',fact:'Built Node.js APIs with PostgreSQL.',skills:['Node.js','PostgreSQL'],verified:true,type:'experience',organization:'Acme',title:'Full Stack Engineer',period:'Mar 2025 - Present',location:'Remote'},
      {id:'cloud',fact:'Deployed services on AWS.',skills:['AWS'],verified:true,type:'project',organization:'Cloud Console',evidenceUrl:'https://example.com/cloud'},
      {id:'project2',fact:'Built realtime collaboration features.',skills:['Socket.IO','WebSockets'],verified:true,type:'project',organization:'Realtime App'},
      {id:'project3',fact:'Added presence and typing indicators.',skills:['WebSockets'],verified:true,type:'project',organization:'Realtime App'},
      {id:'award',fact:'Won a university product hackathon.',skills:[],verified:true,type:'achievement'},
      {id:'award2',fact:'Won a second product hackathon.',skills:[],verified:true,type:'achievement'},
      {id:'award3',fact:'Placed in the top one percent by CGPA.',skills:[],verified:true,type:'achievement'}
    ]
  });
  const job = normalizeJob(rawJob); const analysis = analyzeJD(job); const matched = matchEvidence(pdfProfile, analysis.requirements);
  const plan = planResume({ profile:pdfProfile, job, matchedRequirements:matched }); const resume = generateResume({ profile:pdfProfile, job, plan });
  const file = path.join(dir,'resume.pdf'); await renderResumePdf(resume,file); const report = await validatePdf(file,resume);
  assert.equal(report.valid,true); assert.ok(report.pages>=1); assert.ok(report.text.includes('TECHNICAL SKILLS'));
  assert.ok(report.text.includes('EXPERIENCE')); assert.ok(report.text.includes('PROJECTS')); assert.ok(report.text.includes('ACHIEVEMENTS')); assert.ok(report.text.includes('EDUCATION'));
  assert.ok(report.text.includes('Mar 2025 - Present')); assert.ok(report.text.includes('Remote')); assert.ok(report.text.includes('2025 - 2028'));
  assert.equal((report.text.match(/Realtime App/g) || []).length,1);
  assert.ok(report.text.includes('Built realtime collaboration features.'));
  assert.ok(report.text.includes('Added presence and typing indicators.'));
  assert.equal(report.layout.horizontalOverflow,false); assert.ok(report.text.includes('Résumé Candidate'));
  assert.equal((await readFile(file)).subarray(0,5).toString(), '%PDF-');
});

test('submission ownership is exclusive under concurrency', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'job-lock-')); const ledger = new Ledger(dir); const job = normalizeJob(rawJob);
  const [a,b] = await Promise.all([ledger.acquire(job), ledger.acquire(job)]);
  assert.equal(Number(a.owned) + Number(b.owned), 1);
  await a.release(); await b.release();
});
