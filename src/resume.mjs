import { evidenceIndex } from './career.mjs';
import { uniq } from './utils.mjs';

const LANGUAGE_SKILLS = new Set(['javascript','typescript','python','java','go','c++','c#','ruby','php','swift','kotlin','sql','html','css']);
const FRAMEWORK_SKILLS = new Set(['react','react.js','next.js','node.js','express','react native','flutter','tailwind','graphql','prisma','supabase','socket.io','websockets','jest','vitest','playwright']);
const DATABASE_SKILLS = new Set(['postgresql','mysql','mongodb','redis','sqlite','dynamodb','elasticsearch']);
const CLOUD_TOOL_SKILLS = new Set(['aws','gcp','azure','docker','kubernetes','terraform','ci/cd','git','github actions','vercel','cloudflare','rest','microservices']);

const normalizedType = (value = '') => {
  const type = String(value).toLowerCase();
  if (type.includes('experience')) return 'experience';
  if (type.includes('project')) return 'project';
  if (type.includes('achievement') || type.includes('award') || type.includes('hackathon')) return 'achievement';
  if (type.includes('education')) return 'education';
  if (type.includes('certification')) return 'certification';
  if (type.includes('skill')) return 'skill';
  return 'other';
};

const technicalGroupFor = (skill) => {
  const key = String(skill).trim().toLowerCase();
  if (LANGUAGE_SKILLS.has(key)) return 'Languages';
  if (FRAMEWORK_SKILLS.has(key)) return 'Frameworks / Libraries';
  if (DATABASE_SKILLS.has(key)) return 'Databases';
  if (CLOUD_TOOL_SKILLS.has(key)) return 'Cloud / Tools';
  return null;
};

const addUnique = (chosen, evidence, maximumClaims) => {
  if (!evidence || chosen.length >= maximumClaims || chosen.some((item) => item.id === evidence.id)) return;
  chosen.push(evidence);
};

export function planResume({ profile, job, matchedRequirements }) {
  const matchCounts = new Map();
  for (const requirement of matchedRequirements) {
    for (const id of requirement.evidenceIds || []) matchCounts.set(id, (matchCounts.get(id) || 0) + (requirement.kind === 'must-have' ? 3 : 1));
  }

  const jd = `${job.title} ${job.description || ''}`.toLowerCase();
  const ranked = profile.evidence.map((evidence, index) => {
    const skillHits = (evidence.skills || []).filter((skill) => jd.includes(String(skill).toLowerCase())).length;
    const type = normalizedType(evidence.type);
    const typeBonus = type === 'experience' ? 3 : type === 'project' ? 2.5 : type === 'achievement' ? 2 : 0;
    return { evidence, type, score: (matchCounts.get(evidence.id) || 0) * 10 + skillHits * 3 + typeBonus - index / 1000 };
  }).sort((a, b) => b.score - a.score);

  const directlyMatched = new Set(matchCounts.keys());
  const minimumClaims = Math.min(8, profile.evidence.filter((item) => normalizedType(item.type) !== 'education').length);
  const maximumClaims = Math.min(12, profile.evidence.length);
  const chosen = [];

  for (const row of ranked) {
    if (directlyMatched.has(row.evidence.id) && row.type !== 'education') addUnique(chosen, row.evidence, maximumClaims);
  }

  // Preserve breadth: every verified employer gets representation before duplicate bullets consume the budget.
  const representedOrganizations = new Set(chosen.filter((item) => normalizedType(item.type) === 'experience').map((item) => String(item.organization || '').toLowerCase()).filter(Boolean));
  for (const row of ranked.filter((item) => item.type === 'experience' && item.evidence.organization)) {
    const organization = String(row.evidence.organization).toLowerCase();
    if (!representedOrganizations.has(organization)) {
      addUnique(chosen, row.evidence, maximumClaims);
      representedOrganizations.add(organization);
    }
  }

  // Jake-style resumes benefit from distinct project and achievement sections, so keep useful breadth even when the JD match is narrow.
  for (const type of ['project', 'achievement']) {
    const floor = type === 'project' ? 2 : 2;
    let count = chosen.filter((item) => normalizedType(item.type) === type).length;
    for (const row of ranked.filter((item) => item.type === type)) {
      if (count >= floor) break;
      const before = chosen.length;
      addUnique(chosen, row.evidence, maximumClaims);
      if (chosen.length > before) count++;
    }
  }

  for (const row of ranked) {
    if (chosen.length >= minimumClaims) break;
    if (row.type !== 'education') addUnique(chosen, row.evidence, maximumClaims);
  }

  const technicalSkills = uniq(chosen.flatMap((evidence) => evidence.skills || []))
    .filter((skill) => technicalGroupFor(skill))
    .sort((a, b) => Number(jd.includes(String(b).toLowerCase())) - Number(jd.includes(String(a).toLowerCase())));

  const skillGroups = {};
  for (const skill of technicalSkills) {
    const group = technicalGroupFor(skill);
    if (!group) continue;
    (skillGroups[group] ||= []).push(skill);
  }

  return {
    targetRole: job.title,
    evidenceIds: uniq(chosen.map((evidence) => evidence.id)),
    skillOrder: technicalSkills,
    skillGroups,
    keywords: uniq(matchedRequirements.filter((requirement) => requirement.status === 'met').flatMap((requirement) => requirement.skills || [])),
    excludedEvidence: profile.evidence.filter((evidence) => !chosen.some((item) => item.id === evidence.id)).map((evidence) => evidence.id)
  };
}

const claimFromEvidence = (evidence) => ({
  text: evidence.fact,
  evidenceIds: [evidence.id],
  organization: evidence.organization || null,
  title: evidence.title || null,
  type: normalizedType(evidence.type),
  period: evidence.period || evidence.dates || evidence.date || null,
  location: evidence.location || null,
  evidenceUrl: evidence.evidenceUrl || evidence.url || null,
  skills: evidence.skills || []
});

const sectionsFromClaims = (claims) => ({
  experience: claims.filter((claim) => claim.type === 'experience'),
  projects: claims.filter((claim) => claim.type === 'project'),
  achievements: claims.filter((claim) => claim.type === 'achievement')
});

export function generateResume({ profile, job, plan, injectUnsupportedClaim = false }) {
  const index = evidenceIndex(profile);
  const selected = plan.evidenceIds.map((id) => index.get(id)).filter(Boolean);
  const claims = selected.map(claimFromEvidence);
  if (injectUnsupportedClaim) claims.unshift({ text: 'Scaled Kubernetes infrastructure by 47% while leading a 12-person platform team.', evidenceIds: [], type: 'other', skills: [] });

  const topSkills = plan.skillOrder.slice(0, 5);
  const summaryText = topSkills.length
    ? `Engineer with verified experience across ${topSkills.join(', ')}, focused on shipping reliable product and platform work.`
    : 'Engineer with experience selected exclusively from verified career evidence.';

  const evidenceEducation = profile.evidence
    .filter((evidence) => normalizedType(evidence.type) === 'education')
    .map((evidence) => ({
      degree: evidence.title || evidence.fact,
      institution: evidence.organization || '',
      period: evidence.period || evidence.dates || evidence.date || null,
      location: evidence.location || null,
      evidenceId: evidence.id
    }));

  return {
    identity: profile.identity,
    targetRole: job.title,
    summary: { text: summaryText, evidenceIds: plan.evidenceIds.slice(0, Math.min(3, plan.evidenceIds.length)) },
    skills: plan.skillOrder,
    skillGroups: plan.skillGroups || {},
    claims,
    ...sectionsFromClaims(claims),
    education: (profile.education?.length ? profile.education : evidenceEducation) || []
  };
}

export function repairResume(resume, report) {
  const rejected = new Set(report.issues.filter((issue) => issue.severity === 'critical').map((issue) => issue.claim));
  const claims = resume.claims.filter((claim) => !rejected.has(claim.text));
  return { ...resume, claims, ...sectionsFromClaims(claims) };
}
