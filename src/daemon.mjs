#!/usr/bin/env node
import path from 'node:path';
import { JobControlPlane } from './control-plane.mjs';
import { PlaywrightAts } from './application/playwright-ats.mjs';

const baseDir = process.cwd();
const control = new JobControlPlane({
  stateDir: path.resolve(baseDir, process.env.JOB_APPLY_STATE_DIR || '.job-apply'),
  profileFile: path.resolve(baseDir, process.env.JOB_APPLY_PROFILE || 'candidate/profile.json'),
  preferencesFile: path.resolve(baseDir, process.env.JOB_APPLY_PREFERENCES || 'candidate/preferences.json'),
  sourcesFile: path.resolve(baseDir, process.env.JOB_APPLY_SOURCES || 'config/sources.json'),
  ats: new PlaywrightAts({ headless: true, allowSubmit: false }),
});
const intervalMinutes = Math.max(60, Number(process.env.JOB_APPLY_DISCOVERY_INTERVAL_MINUTES || 240));
const run = async () => { try { const result = await control.discover(); console.log(JSON.stringify({ at:new Date().toISOString(), ...result })); } catch(error) { console.error(JSON.stringify({ at:new Date().toISOString(), error:error.message })); } };
await run();
setInterval(run, intervalMinutes * 60_000);
