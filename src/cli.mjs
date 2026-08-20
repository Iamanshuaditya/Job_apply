#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { processJob } from './pipeline.mjs';
import { MockATS } from './application/mock-ats.mjs';
import { validateCareerProfile } from './career.mjs';

const [,, command, ...args] = process.argv;
const load = async (file) => JSON.parse(await readFile(file, 'utf8'));

if (command === 'profile' && args[0] === 'validate') {
  console.log(JSON.stringify(validateCareerProfile(await load(args[1])), null, 2));
} else if (command === 'dry-run' || command === 'apply-one') {
  const profile = await load(args[0]); const prefs = await load(args[1]); const job = await load(args[2]);
  const mode = command === 'dry-run' ? 'ambiguous' : 'success';
  const result = await processJob({ rawProfile: profile, preferences: prefs, rawJob: job, runDir: args[3] || '.job-apply-run', ats: new MockATS(mode) });
  console.log(JSON.stringify({ state: result.state, job: result.job, assessment: result.assessment, verification: result.verification }, null, 2));
} else {
  console.log(`Usage:\n  job-apply profile validate <candidate.json>\n  job-apply dry-run <candidate.json> <preferences.json> <job.json> [run-dir]\n  job-apply apply-one <candidate.json> <preferences.json> <job.json> [run-dir]`);
  if (command) process.exitCode = 1;
}
