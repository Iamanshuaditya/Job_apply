import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJob, jobFingerprint } from '../src/jobs.mjs';
import { hardFilter } from '../src/filters.mjs';

const prefs = { targetTitles:['Full Stack'], targetSkills:['React','Node.js'], excludedCompanies:['Blocked'], workModes:['remote'], employmentTypes:['full-time'] };
const profile = { eligibility:{} };

test('1,000 discovered jobs normalize/filter/dedupe without architecture failure', () => {
  const seen = new Set(); let duplicates=0, filtered=0, qualified=0;
  for (let i=0;i<1000;i++) {
    const duplicateOf = i > 0 && i % 10 === 0 ? i - 1 : i;
    const raw = { company:i%17===0?'Blocked':`Company ${duplicateOf%100}`, title:i%4===0?'Accountant':'Full Stack Engineer', canonicalUrl:`https://jobs.test/${duplicateOf}?utm_source=batch`, applicationUrl:`https://jobs.test/${duplicateOf}`, externalId:String(duplicateOf), workMode:'remote', employmentType:'full-time', status:i%29===0?'closed':'active', description:i%4===0?'finance':'React Node.js' };
    const job = normalizeJob(raw); const fp = jobFingerprint(job);
    if (seen.has(fp)) { duplicates++; continue; } seen.add(fp);
    const gate = hardFilter(job,prefs,profile); if (!gate.pass) filtered++; else qualified++;
  }
  assert.ok(duplicates >= 80); assert.equal(seen.size, 1000 - duplicates); assert.ok(filtered>0); assert.ok(qualified>0); assert.equal(duplicates+filtered+qualified,1000);
});
