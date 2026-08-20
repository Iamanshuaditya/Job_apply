import { readFile } from 'node:fs/promises';
import { sha256 } from '../utils.mjs';

export class MockATS {
  constructor(mode = 'success') { this.mode = mode; this.received = []; }
  async submit({ job, profile, resumePath }) {
    if (this.mode === 'captcha') return { status: 'attention', reason: 'CAPTCHA' };
    if (this.mode === 'legal') return { status: 'attention', reason: 'LEGAL_ATTESTATION' };
    if (this.mode === 'error') return { status: 'error', reason: 'HTTP_500' };
    const resume = await readFile(resumePath);
    const received = { jobId: job.jobId, name: profile.identity.name, resumeHash: sha256(resume), at: new Date().toISOString() };
    this.received.push(received);
    if (this.mode === 'ambiguous') return { status: 'unconfirmed', received };
    return { status: 'submitted', confirmation: { type: 'mock-success-page', confirmationId: `mock-${job.jobId}` }, received };
  }
}
