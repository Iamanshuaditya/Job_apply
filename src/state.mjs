import { readJson, writeJson } from './utils.mjs';

export const STATES = ['DISCOVERED','NORMALIZED','FILTERED_OUT','QUALIFIED','RESUME_PLANNED','RESUME_GENERATED','RESUME_REJECTED','RESUME_VERIFIED','APPLICATION_READY','AWAITING_APPROVAL','APPROVED','QUEUED','APPLICATION_IN_PROGRESS','ATTENTION_REQUIRED','SUBMITTED','SUBMISSION_UNCONFIRMED','FAILED','CLOSED'];
const ALLOWED = {
  DISCOVERED:['NORMALIZED'], NORMALIZED:['FILTERED_OUT','QUALIFIED'], QUALIFIED:['RESUME_PLANNED'], RESUME_PLANNED:['RESUME_GENERATED'],
  RESUME_GENERATED:['RESUME_REJECTED','RESUME_VERIFIED'], RESUME_REJECTED:['RESUME_GENERATED','FAILED'], RESUME_VERIFIED:['APPLICATION_READY'],
  APPLICATION_READY:['AWAITING_APPROVAL','APPLICATION_IN_PROGRESS'], AWAITING_APPROVAL:['APPROVED','APPLICATION_IN_PROGRESS','CLOSED'],
  APPROVED:['QUEUED','APPLICATION_IN_PROGRESS','CLOSED'], QUEUED:['APPLICATION_IN_PROGRESS','CLOSED'],
  APPLICATION_IN_PROGRESS:['ATTENTION_REQUIRED','SUBMITTED','SUBMISSION_UNCONFIRMED','FAILED'],
  ATTENTION_REQUIRED:['APPLICATION_IN_PROGRESS','CLOSED'], SUBMISSION_UNCONFIRMED:['SUBMITTED','FAILED','ATTENTION_REQUIRED'], FAILED:['DISCOVERED','CLOSED'],
  FILTERED_OUT:[], SUBMITTED:[], CLOSED:[]
};

export function transition(current, next) {
  if (!STATES.includes(next)) throw new Error(`unknown state: ${next}`);
  if (!ALLOWED[current]?.includes(next)) throw new Error(`illegal transition: ${current} -> ${next}`);
  return next;
}

export class CheckpointStore {
  constructor(file) { this.file = file; }
  async load() { return await readJson(this.file, { jobs: {} }); }
  async get(jobId) { return (await this.load()).jobs[jobId] || null; }
  async save(jobId, patch) { const all = await this.load(); all.jobs[jobId] = { ...(all.jobs[jobId] || {}), ...patch, updatedAt: new Date().toISOString() }; await writeJson(this.file, all); return all.jobs[jobId]; }
}
