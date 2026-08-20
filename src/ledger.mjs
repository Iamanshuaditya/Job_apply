import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { appendNdjson, ensureDir, readNdjson, sha256 } from './utils.mjs';
import { jobFingerprint } from './jobs.mjs';

export class Ledger {
  constructor(dir) { this.dir = dir; this.applications = path.join(dir, 'applications.ndjson'); this.attention = path.join(dir, 'attention.ndjson'); this.locks = path.join(dir, 'locks'); }
  async rows() { return await readNdjson(this.applications); }
  async check(job) { const rows = await this.rows(); const fp = jobFingerprint(job); return rows.find((r) => r.fingerprint === fp && r.application?.status === 'submitted') || null; }
  async addSubmitted({ job, resumePath, resumeHash, confirmation, assessment }) {
    if (await this.check(job)) return { duplicate: true };
    const row = { jobId: job.jobId, fingerprint: jobFingerprint(job), company: job.company, title: job.title, url: job.canonicalUrl, assessment,
      resume: { path: resumePath, hash: resumeHash }, application: { status: 'submitted', submittedAt: new Date().toISOString(), confirmation } };
    await appendNdjson(this.applications, row); return row;
  }
  async addAttention(job, reason) { const row = { id: sha256(`${job.jobId}:${reason}`).slice(0, 16), jobId: job.jobId, company: job.company, title: job.title, reason, createdAt: new Date().toISOString() }; await appendNdjson(this.attention, row); return row; }
  async acquire(job) {
    await ensureDir(this.locks); const lock = path.join(this.locks, sha256(jobFingerprint(job)).slice(0, 24) + '.lock');
    try { const handle = await open(lock, 'wx', 0o600); await handle.writeFile(`${process.pid}\n`); await handle.close(); return { owned: true, release: async () => { try { await unlink(lock); } catch {} } }; }
    catch (error) { if (error.code === 'EEXIST') return { owned: false, release: async () => {} }; throw error; }
  }
}
