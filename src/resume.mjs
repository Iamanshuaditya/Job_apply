import { evidenceIndex } from './career.mjs';
import { uniq } from './utils.mjs';

export function planResume({ profile, job, matchedRequirements }) {
  const relevantIds = uniq(matchedRequirements.flatMap((r) => r.evidenceIds || []));
  const selected = relevantIds.map((id) => profile.evidence.find((e) => e.id === id)).filter(Boolean);
  const fallback = selected.length ? [] : profile.evidence.slice(0, 4);
  const chosen = [...selected, ...fallback];
  return {
    targetRole: job.title,
    evidenceIds: uniq(chosen.map((e) => e.id)),
    skillOrder: uniq(chosen.flatMap((e) => e.skills || [])),
    keywords: uniq(matchedRequirements.filter((r) => r.status === 'met').flatMap((r) => r.skills || [])),
    excludedEvidence: profile.evidence.filter((e) => !chosen.some((c) => c.id === e.id)).map((e) => e.id)
  };
}

export function generateResume({ profile, job, plan, injectUnsupportedClaim = false }) {
  const index = evidenceIndex(profile);
  const claims = plan.evidenceIds.map((id) => ({ text: index.get(id).fact, evidenceIds: [id] }));
  if (injectUnsupportedClaim) claims.unshift({ text: 'Scaled Kubernetes infrastructure by 47% while leading a 12-person platform team.', evidenceIds: [] });
  return {
    identity: profile.identity,
    targetRole: job.title,
    summary: { text: `Full-stack engineer targeting ${job.title}, with experience selected from verified career evidence.`, evidenceIds: plan.evidenceIds.slice(0, 3) },
    skills: plan.skillOrder,
    claims,
    education: profile.education || []
  };
}

export function repairResume(resume, report) {
  const rejected = new Set(report.issues.filter((i) => i.severity === 'critical').map((i) => i.claim));
  return { ...resume, claims: resume.claims.filter((claim) => !rejected.has(claim.text)) };
}
