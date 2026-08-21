import path from 'node:path';
import { discoverAll } from './discovery/adapters.mjs';
import { normalizeJob } from './jobs.mjs';
import { hardFilter } from './filters.mjs';
import { JobStore } from './job-store.mjs';
import { processJob } from './pipeline.mjs';
import { readJson, writeJson, ensureDir } from './utils.mjs';

const mapPipelineState = (state) => (state === 'AWAITING_APPROVAL' || state === 'APPLICATION_READY') ? 'AWAITING_APPROVAL' : state;
const normalizedText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const evidenceKey = (item) => [normalizedText(item?.fact), normalizedText(item?.organization), normalizedText(item?.title)].join('|');
const educationKey = (item) => [normalizedText(item?.degree || item?.title), normalizedText(item?.institution || item?.organization)].join('|');
const meaningful = (value) => value != null && !(typeof value === 'string' && value.trim() === '') && !(Array.isArray(value) && value.length === 0);
const clampInteger = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback));

const mergeMeaningfulObject = (existing = {}, incoming = {}) => {
  const result = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming || {})) if (meaningful(value)) result[key] = value;
  return result;
};

const mergeRows = (existing = [], incoming = [], keyFor = (item) => item?.id || '') => {
  if (!incoming?.length) return [...(existing || [])];
  const result = [...(existing || [])];
  const byId = new Map(result.filter((item) => item?.id).map((item, index) => [item.id, index]));
  const byKey = new Map(result.map((item, index) => [keyFor(item), index]).filter(([key]) => key && key !== '||' && key !== '|'));
  for (const item of incoming) {
    const matchedById = Boolean(item?.id && byId.has(item.id));
    const index = matchedById ? byId.get(item.id) : byKey.get(keyFor(item));
    if (index !== undefined) {
      const existingId = result[index]?.id;
      result[index] = {
        ...result[index],
        ...item,
        ...(!matchedById && existingId ? { id: existingId } : {})
      };
      if (item?.id) byId.set(item.id, index);
      if (result[index]?.id) byId.set(result[index].id, index);
      byKey.set(keyFor(result[index]), index);
    } else {
      const nextIndex = result.length;
      result.push(item);
      if (item?.id) byId.set(item.id, nextIndex);
      byKey.set(keyFor(item), nextIndex);
    }
  }
  return result;
};

export function mergeProfileConfig(existing = {}, incoming = {}) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (['identity', 'context', 'eligibility', 'education', 'evidence', 'version'].includes(key)) continue;
    if (meaningful(value)) merged[key] = value;
  }
  merged.identity = mergeMeaningfulObject(existing?.identity || {}, incoming?.identity || {});
  merged.context = mergeMeaningfulObject(existing?.context || {}, incoming?.context || {});
  merged.eligibility = mergeMeaningfulObject(existing?.eligibility || {}, incoming?.eligibility || {});
  merged.education = mergeRows(existing?.education || [], incoming?.education || [], educationKey);
  merged.evidence = mergeRows(existing?.evidence || [], incoming?.evidence || [], evidenceKey);
  if (existing?.version) {
    merged.version = existing.version;
    if (incoming?.version && incoming.version !== existing.version) merged.crmProjectionVersion = incoming.version;
  } else if (meaningful(incoming?.version)) {
    merged.version = incoming.version;
  }
  return merged;
}

export class JobControlPlane {
  constructor({ stateDir, profileFile, preferencesFile, sourcesFile, ats, fetchImpl = globalThis.fetch }) {
    this.stateDir = stateDir;
    this.profileFile = profileFile;
    this.preferencesFile = preferencesFile;
    this.sourcesFile = sourcesFile;
    this.ats = ats;
    this.fetchImpl = fetchImpl;
    this.jobs = new JobStore(stateDir);
    this.runsFile = path.join(stateDir, 'runs.json');
  }

  async config() {
    const [profile, preferences, sources] = await Promise.all([
      readJson(this.profileFile),
      readJson(this.preferencesFile, {}),
      readJson(this.sourcesFile, [])
    ]);
    if (!profile) throw new Error(`candidate profile not found: ${this.profileFile}`);
    return { profile, preferences, sources };
  }

  async updateConfig({ profile, preferences, sources }) {
    if (profile) {
      const existing = await readJson(this.profileFile, {});
      await writeJson(this.profileFile, mergeProfileConfig(existing, profile));
    }
    if (preferences) await writeJson(this.preferencesFile, preferences);
    if (sources) await writeJson(this.sourcesFile, sources);
    return { ok: true };
  }

  async recordRun(run) {
    const state = await readJson(this.runsFile, { runs: [] });
    state.runs.unshift(run);
    state.runs = state.runs.slice(0, 200);
    await writeJson(this.runsFile, state);
  }

  async discover() {
    await ensureDir(this.stateDir);
    const { profile, preferences, sources } = await this.config();
    const run = { id: `discover-${Date.now()}`, type: 'DISCOVERY', startedAt: new Date().toISOString(), status: 'RUNNING' };
    const found = await discoverAll(sources, { fetchImpl: this.fetchImpl });
    const normalized = [];
    let filtered = 0;
    for (const raw of found.jobs) {
      try {
        const job = normalizeJob(raw);
        const filter = hardFilter(job, preferences, profile);
        normalized.push({ ...job, discoveryFilter: filter });
        if (!filter.pass) filtered++;
      } catch {}
    }
    const result = await this.jobs.upsertDiscovered(normalized);
    for (const job of normalized.filter((item) => item.discoveryFilter && !item.discoveryFilter.pass)) {
      await this.jobs.patch(job.jobId, { crmStatus: 'FILTERED_OUT', filterReasons: job.discoveryFilter.reasons });
    }
    Object.assign(run, {
      status: 'COMPLETED', finishedAt: new Date().toISOString(), discovered: found.jobs.length,
      normalized: normalized.length, newJobs: result.inserted, refreshed: result.refreshed, filtered, errors: found.errors
    });
    await this.recordRun(run);
    return run;
  }

  async prepare({ limit = 100, jobIds = null } = {}) {
    const safeLimit = clampInteger(limit, 1, 500, 100);
    const { profile, preferences } = await this.config();
    const candidates = jobIds?.length
      ? (await Promise.all(jobIds.slice(0, 500).map((id) => this.jobs.get(id)))).filter(Boolean)
      : await this.jobs.list({ statuses: ['DISCOVERED'], limit: safeLimit });
    const runId = `prepare-${Date.now()}`;
    const runDir = path.join(this.stateDir, 'runs', runId);
    const results = [];
    for (const job of candidates) {
      const result = await processJob({ rawJob: job, rawProfile: profile, preferences, runDir, ats: this.ats, submissionMode: 'prepare-only' });
      const status = mapPipelineState(result.state);
      const checkpoint = (await readJson(path.join(runDir, 'checkpoints.json'), { jobs: {} })).jobs?.[job.jobId] || {};
      const assessment = result.assessment ?? checkpoint.assessment ?? null;
      const matched = result.matched ?? checkpoint.matched ?? null;
      await this.jobs.patch(job.jobId, {
        crmStatus: status,
        fitScore: assessment?.score ?? null,
        fitRoute: assessment?.route ?? null,
        fitDimensions: assessment?.dimensions ?? null,
        mustHaveCoverage: assessment?.mustHaveCoverage ?? null,
        hardFailures: assessment?.hardFailures ?? [],
        roleFamily: assessment?.roleFamily ?? checkpoint.analysis?.roleFamily ?? null,
        matchedRequirements: matched ?? [],
        resumePath: result.resumePath ?? checkpoint.resumePath ?? null,
        resumeHash: result.resumeHash ?? checkpoint.resumeHash ?? null,
        verification: result.verification ?? checkpoint.verification ?? null,
        runId
      });
      results.push({ jobId: job.jobId, company: job.company, title: job.title, state: status, score: assessment?.score ?? null, route: assessment?.route ?? null });
    }
    const run = { id: runId, type: 'PREPARE', status: 'COMPLETED', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), processed: results.length, results };
    await this.recordRun(run);
    return run;
  }

  async runAll({ prepareLimit = 100 } = {}) {
    const discovery = await this.discover();
    const preparation = await this.prepare({ limit: clampInteger(prepareLimit, 1, 500, 100) });
    return { discovery, preparation, gate: 'AWAITING_APPROVAL' };
  }

  async approve(jobIds = 'all') {
    const approved = await this.jobs.approve(jobIds);
    return approved.map(({ jobId, company, title }) => ({ jobId, company, title }));
  }

  async applyApproved({ limit = 20 } = {}) {
    const safeLimit = clampInteger(limit, 1, 100, 20);
    const { profile, preferences } = await this.config();
    const jobs = await this.jobs.list({ statuses: ['APPROVED'], limit: safeLimit });
    const runId = `apply-${Date.now()}`;
    const defaultRunDir = path.join(this.stateDir, 'runs', runId);
    const results = [];
    for (const job of jobs) {
      if (!job.resumeHash || !job.resumePath) {
        const reason = !job.resumeHash ? 'REVIEWED_RESUME_HASH_MISSING' : 'REVIEWED_RESUME_MISSING';
        await this.jobs.patch(job.jobId, { crmStatus: 'ATTENTION_REQUIRED', applicationResult: { state: 'ATTENTION_REQUIRED', reason } });
        results.push({ jobId: job.jobId, company: job.company, title: job.title, state: 'ATTENTION_REQUIRED', reason });
        continue;
      }
      await this.jobs.patch(job.jobId, { crmStatus: 'QUEUED' });
      await this.jobs.patch(job.jobId, { crmStatus: 'APPLICATION_IN_PROGRESS' });
      const runDir = job.runId ? path.join(this.stateDir, 'runs', job.runId) : defaultRunDir;
      const result = await processJob({
        rawJob: job, rawProfile: profile, preferences, runDir, ats: this.ats,
        submissionMode: 'auto', expectedResumeHash: job.resumeHash, requireReviewedResume: true
      });
      await this.jobs.patch(job.jobId, {
        crmStatus: result.state,
        appliedAt: result.state === 'SUBMITTED' ? new Date().toISOString() : null,
        applicationEmail: profile.identity?.email || null,
        confirmation: result.ledger?.application?.confirmation || null,
        applicationResult: { state: result.state, reason: result.reason || null }
      });
      results.push({ jobId: job.jobId, company: job.company, title: job.title, state: result.state, reason: result.reason || null });
    }
    const run = { id: runId, type: 'APPLY', status: 'COMPLETED', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), processed: results.length, results };
    await this.recordRun(run);
    return run;
  }

  async snapshot() {
    // The job list is capped, so it must be ordered by what the reviewer can act
    // on. Sorting purely by date lets thousands of FILTERED_OUT rows crowd the
    // review queue out of the window, which shows up as an empty dashboard.
    const NOISE = ['FILTERED_OUT', 'CLOSED'];
    const [summary, actionable, recent, runs] = await Promise.all([
      this.jobs.summary(),
      this.jobs.list({ limit: 1000 }).then((rows) => rows.filter((job) => !NOISE.includes(job.crmStatus))),
      this.jobs.list({ limit: 300 }).then((rows) => rows.filter((job) => NOISE.includes(job.crmStatus))),
      readJson(this.runsFile, { runs: [] })
    ]);
    const jobs = [...actionable, ...recent.slice(0, Math.max(0, 300 - actionable.length))];
    return { summary, jobs, runs: runs.runs.slice(0, 30), updatedAt: new Date().toISOString() };
  }
}
