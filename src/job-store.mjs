import path from 'node:path';
import { readJson, writeJson } from './utils.mjs';
import { jobFingerprint } from './jobs.mjs';

const TERMINAL = new Set(['SUBMITTED', 'FILTERED_OUT', 'CLOSED']);

export class JobStore {
  constructor(dir) { this.file = path.join(dir, 'jobs.json'); }
  async load() { return await readJson(this.file, { jobs: {}, updatedAt: null }); }
  async save(state) { state.updatedAt = new Date().toISOString(); await writeJson(this.file, state); return state; }
  async upsertDiscovered(jobs) {
    const state = await this.load(); let inserted = 0; let refreshed = 0;
    for (const job of jobs) {
      const existing = state.jobs[job.jobId];
      if (!existing) {
        state.jobs[job.jobId] = { ...job, fingerprint: jobFingerprint(job), crmStatus: 'DISCOVERED', approval: 'PENDING', firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }; inserted++;
      } else {
        state.jobs[job.jobId] = { ...existing, ...job, crmStatus: existing.crmStatus, approval: existing.approval || 'PENDING', lastSeenAt: new Date().toISOString() }; refreshed++;
      }
    }
    await this.save(state); return { inserted, refreshed, total: Object.keys(state.jobs).length };
  }
  async get(jobId) { return (await this.load()).jobs[jobId] || null; }
  async list({ statuses, approval, limit = 500 } = {}) {
    const values = Object.values((await this.load()).jobs);
    return values.filter((job) => !statuses?.length || statuses.includes(job.crmStatus)).filter((job) => !approval || job.approval === approval).sort((a,b)=>String(b.postedAt || b.firstSeenAt).localeCompare(String(a.postedAt || a.firstSeenAt))).slice(0,limit);
  }
  async patch(jobId, patch) { const state = await this.load(); if (!state.jobs[jobId]) throw new Error(`unknown job: ${jobId}`); state.jobs[jobId] = { ...state.jobs[jobId], ...patch, updatedAt: new Date().toISOString() }; await this.save(state); return state.jobs[jobId]; }
  async approve(jobIds) {
    const state = await this.load(); const targets = jobIds === 'all' ? Object.values(state.jobs).filter((job) => job.crmStatus === 'AWAITING_APPROVAL') : jobIds.map((id)=>state.jobs[id]).filter(Boolean);
    for (const job of targets) { if (job.crmStatus !== 'AWAITING_APPROVAL' && job.crmStatus !== 'APPLICATION_READY') continue; job.approval='APPROVED'; job.crmStatus='APPROVED'; job.approvedAt=new Date().toISOString(); }
    await this.save(state); return targets;
  }
  async reject(jobIds) { const state = await this.load(); for (const id of jobIds) { const job=state.jobs[id]; if (!job) continue; job.approval='REJECTED'; job.crmStatus='CLOSED'; job.closedAt=new Date().toISOString(); } await this.save(state); }
  async summary() { const jobs=Object.values((await this.load()).jobs); const counts={}; for(const job of jobs) counts[job.crmStatus]=(counts[job.crmStatus]||0)+1; return { total:jobs.length, discovered:counts.DISCOVERED||0, awaitingApproval:counts.AWAITING_APPROVAL||0, approved:counts.APPROVED||0, queued:counts.QUEUED||0, applying:(counts.APPLYING||0)+(counts.APPLICATION_IN_PROGRESS||0), submitted:counts.SUBMITTED||0, attention:counts.ATTENTION_REQUIRED||0, failed:counts.FAILED||0, filtered:counts.FILTERED_OUT||0, counts }; }
}
