#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JobControlPlane } from './control-plane.mjs';
import { PlaywrightAts } from './application/playwright-ats.mjs';
import { sha256 } from './utils.mjs';

const RESUME_TICKET_TTL_MS = 10 * 60 * 1000;
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

export function createControlPlaneServer(options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const stateDir = options.stateDir || path.resolve(baseDir, process.env.JOB_APPLY_STATE_DIR || '.job-apply');
  const control = options.control || new JobControlPlane({
    stateDir,
    profileFile: path.resolve(baseDir, process.env.JOB_APPLY_PROFILE || 'candidate/profile.json'),
    preferencesFile: path.resolve(baseDir, process.env.JOB_APPLY_PREFERENCES || 'candidate/preferences.json'),
    sourcesFile: path.resolve(baseDir, process.env.JOB_APPLY_SOURCES || 'config/sources.json'),
    ats: new PlaywrightAts({
      headless: process.env.JOB_APPLY_HEADLESS !== 'false',
      allowSubmit: process.env.JOB_APPLY_ALLOW_SUBMIT === 'true'
    })
  });
  const controlToken = options.controlToken ?? process.env.JOB_APPLY_CONTROL_TOKEN ?? null;
  const publicBaseUrl = (options.publicBaseUrl || process.env.JOB_APPLY_PUBLIC_URL || '').replace(/\/$/, '');
  const resumeTickets = new Map();

  const pruneTickets = () => {
    const now = Date.now();
    for (const [ticket, entry] of resumeTickets) if (entry.expiresAt <= now) resumeTickets.delete(ticket);
  };
  const ticketAllows = (ticket, jobId) => {
    if (!ticket) return false;
    pruneTickets();
    const entry = resumeTickets.get(ticket);
    return Boolean(entry && entry.jobId === jobId && entry.expiresAt > Date.now());
  };
  const verifiedResume = async (jobId) => {
    const job = await control.jobs.get(jobId);
    if (!job?.resumePath || !job?.resumeHash) return { error: 'resume-not-reviewed', status: 404 };
    try {
      const bytes = await readFile(job.resumePath);
      if (sha256(bytes) !== job.resumeHash) return { error: 'reviewed-resume-hash-changed', status: 409 };
      return { job, bytes };
    } catch (error) {
      if (error?.code === 'ENOENT') return { error: 'resume-not-found', status: 404 };
      throw error;
    }
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const resumePrefix = '/api/resume/';
      const resumeJobId = req.method === 'GET' && url.pathname.startsWith(resumePrefix)
        ? decodeURIComponent(url.pathname.slice(resumePrefix.length))
        : null;
      const tokenAuthorized = !controlToken || req.headers['x-job-apply-token'] === controlToken;
      const ticketAuthorized = resumeJobId ? ticketAllows(url.searchParams.get('ticket'), resumeJobId) : false;

      if (url.pathname !== '/health' && !tokenAuthorized && !ticketAuthorized) return json(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/api/snapshot') return json(res, 200, await control.snapshot());

      if (req.method === 'POST' && url.pathname === '/api/resume-ticket') {
        if (!tokenAuthorized) return json(res, 401, { error: 'unauthorized' });
        const { jobId } = await readBody(req);
        if (!jobId) return json(res, 400, { error: 'missing-job-id' });
        const reviewed = await verifiedResume(String(jobId));
        if (reviewed.error) return json(res, reviewed.status, { error: reviewed.error });
        pruneTickets();
        const ticket = randomBytes(32).toString('base64url');
        const expiresAt = Date.now() + RESUME_TICKET_TTL_MS;
        resumeTickets.set(ticket, { jobId: String(jobId), expiresAt });
        const fallbackBase = `http://${req.headers.host || '127.0.0.1:4310'}`;
        const base = publicBaseUrl || fallbackBase;
        const previewUrl = `${base}/api/resume/${encodeURIComponent(String(jobId))}?ticket=${encodeURIComponent(ticket)}`;
        return json(res, 200, { url: previewUrl, expiresAt: new Date(expiresAt).toISOString() });
      }

      if (resumeJobId) {
        const reviewed = await verifiedResume(resumeJobId);
        if (reviewed.error) return json(res, reviewed.status, { error: reviewed.error });
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="resume-${resumeJobId}.pdf"`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff'
        });
        return res.end(reviewed.bytes);
      }

      if (req.method === 'POST' && url.pathname === '/api/config') return json(res, 200, await control.updateConfig(await readBody(req)));
      if (req.method === 'POST' && url.pathname === '/api/run/discover') return json(res, 200, await control.discover());
      if (req.method === 'POST' && url.pathname === '/api/run/prepare') return json(res, 200, await control.prepare(await readBody(req)));
      if (req.method === 'POST' && url.pathname === '/api/run/all') return json(res, 200, await control.runAll(await readBody(req)));
      if (req.method === 'POST' && url.pathname === '/api/jobs/approve') {
        const body = await readBody(req);
        return json(res, 200, { approved: await control.approve(body.jobIds || 'all') });
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs/reject') {
        const body = await readBody(req);
        await control.jobs.reject(body.jobIds || []);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/apply/approved') return json(res, 200, await control.applyApproved(await readBody(req)));
      return json(res, 404, { error: 'not-found' });
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT || 4310);
  const host = process.env.JOB_APPLY_HOST || '127.0.0.1';
  createControlPlaneServer().listen(port, host, () => console.log(`Job Apply control plane listening on http://${host}:${port}`));
}
