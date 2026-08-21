import { evidenceIndex } from './career.mjs';
import { uniq } from './utils.mjs';

export function planResume({ profile, job, matchedRequirements }) {
  const matchCounts = new Map();
  for (const requirement of matchedRequirements) {
    for (const id of requirement.evidenceIds || []) matchCounts.set(id, (matchCounts.get(id) || 0) + (requirement.kind === 'must-have' ? 3 : 1));
  }
  const jd = `${job.title} ${job.description || ''}`.toLowerCase();
  const ranked = profile.evidence.map((evidence, index) => {
    const skillHits = (evidence.skills || []).filter((skill) => jd.includes(String(skill).toLowerCase())).length;
    const typeBonus = ['experience','project','achievement'].includes(String(evidence.type || '').toLowerCase()) ? 2 : 0;
    return { evidence, score: (matchCounts.get(evidence.id) || 0) * 10 + skillHits * 3 + typeBonus - index / 1000 };
  }).sort((a, b) => b.score - a.score);

  const directlyMatched = new Set(matchCounts.keys());
  const minimumClaims = Math.min(4, profile.evidence.length);
  const maximumClaims = Math.min(8, profile.evidence.length);
  const chosen = [];
  for (const row of ranked) {
    if (directlyMatched.has(row.evidence.id)) chosen.push(row.evidence);
    if (chosen.length >= maximumClaims) break;
  }
  for (const row of ranked) {
    if (chosen.length >= minimumClaims) break;
    if (!chosen.some((item) => item.id === row.evidence.id)) chosen.push(row.evidence);
  }

  const skillOrder = uniq(chosen.flatMap((e) => e.skills || [])).sort((a, b) => Number(jd.includes(String(b).toLowerCase())) - Number(jd.includes(String(a).toLowerCase())));
  return {
    targetRole: job.title,
    evidenceIds: uniq(chosen.map((e) => e.id)),
    skillOrder,
    keywords: uniq(matchedRequirements.filter((r) => r.status === 'met').flatMap((r) => r.skills || [])),
    excludedEvidence: profile.evidence.filter((e) => !chosen.some((c) => c.id === e.id)).map((e) => e.id)
  };
}

export function generateResume({ profile, job, plan, injectUnsupportedClaim = false }) {
  const index = evidenceIndex(profile);
  const selected = plan.evidenceIds.map((id) => index.get(id)).filter(Boolean);
  const claims = selected.map((evidence) => ({
    text: evidence.fact,
    evidenceIds: [evidence.id],
    organization: evidence.organization || null,
    title: evidence.title || null,
    type: evidence.type || null,
    evidenceUrl: evidence.evidenceUrl || null
  }));
  if (injectUnsupportedClaim) claims.unshift({ text: 'Scaled Kubernetes infrastructure by 47% while leading a 12-person platform team.', evidenceIds: [] });
  const topSkills = plan.skillOrder.slice(0, 5);
  const summaryText = topSkills.length
    ? `Engineer with verified experience across ${topSkills.join(', ')}, focused on shipping reliable product and platform work.`
    : 'Engineer with experience selected exclusively from verified career evidence.';
  return {
    identity: profile.identity,
    targetRole: job.title,
    summary: { text: summaryText, evidenceIds: plan.evidenceIds.slice(0, Math.min(3, plan.evidenceIds.length)) },
    skills: plan.skillOrder,
    claims,
    education: profile.education || []
  };
}

export function repairResume(resume, report) {
  const rejected = new Set(report.issues.filter((i) => i.severity === 'critical').map((i) => i.claim));
  return { ...resume, claims: resume.claims.filter((claim) => !rejected.has(claim.text)) };
}
