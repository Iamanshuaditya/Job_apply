import { assert, sha256, uniq } from './utils.mjs';

export function canonicalizeUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|ref_|source$|src$|gh_src$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}

function normalizeCompanySize(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'number' && Number.isFinite(input)) return { min: input, max: input, label: String(input) };
  if (typeof input === 'object') {
    const min = Number.isFinite(Number(input.min)) ? Number(input.min) : null;
    const max = Number.isFinite(Number(input.max)) ? Number(input.max) : null;
    if (min == null && max == null) return null;
    return { min, max, label: input.label || [min, max].filter((x) => x != null).join('-') };
  }
  const label = String(input).trim();
  const nums = [...label.matchAll(/\d[\d,]*/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite);
  if (!nums.length) return null;
  if (/\+/.test(label)) return { min: nums[0], max: null, label };
  if (nums.length === 1) return { min: nums[0], max: nums[0], label };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]), label };
}

export function normalizeJob(input) {
  assert(input.company && input.title, 'job company and title are required');
  assert(input.applicationUrl || input.canonicalUrl, 'job application URL is required');
  const canonicalUrl = canonicalizeUrl(input.canonicalUrl || input.applicationUrl);
  const applicationUrl = canonicalizeUrl(input.applicationUrl || input.canonicalUrl);
  const locations = uniq((input.locations || []).map(String));
  const externalId = input.externalId || input.requisitionId || null;
  const jobId = input.jobId || sha256([input.company.toLowerCase(), externalId || canonicalUrl].join('|')).slice(0, 20);
  const companySize = normalizeCompanySize(input.companySize ?? input.headcount ?? input.companyHeadcount ?? null);
  return {
    jobId, externalId, company: input.company.trim(), title: input.title.trim(), canonicalUrl, applicationUrl,
    source: input.source || 'provided', description: input.description || '', locations,
    workMode: input.workMode || 'unknown', employmentType: input.employmentType || 'unknown',
    salary: input.salary || null, experience: input.experience || null, postedAt: input.postedAt || null,
    country: input.country || input.companyCountry || null, companySize,
    discoveredAt: input.discoveredAt || new Date().toISOString(), status: input.status || 'active',
    requirements: input.requirements || [], authorization: input.authorization || null
  };
}

export function jobFingerprint(job) {
  if (job.externalId) return `req:${job.company.toLowerCase()}:${String(job.externalId).toLowerCase()}`;
  return `url:${canonicalizeUrl(job.canonicalUrl)}`;
}

export function classifyDuplicate(job, prior) {
  const exact = prior.find((row) => row.fingerprint === jobFingerprint(job) || row.jobId === job.jobId);
  if (exact) return { duplicate: true, kind: 'same-posting', record: exact };
  const similar = prior.find((row) => row.company?.toLowerCase() === job.company.toLowerCase() && row.title?.toLowerCase() === job.title.toLowerCase());
  return similar ? { duplicate: false, kind: 'similar-role', record: similar } : { duplicate: false, kind: 'new-role', record: null };
}
