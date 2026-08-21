import { evidenceIndex } from './career.mjs';
import { uniq } from './utils.mjs';

const LANGUAGE_SKILLS = new Set(['javascript','typescript','python','java','go','c++','c#','ruby','php','swift','kotlin','html','css']);
const FRAMEWORK_SKILLS = new Set(['react','next.js','node.js','express','react native','flutter','tailwind','prisma','supabase','jest','vitest','playwright']);
const DATABASE_SKILLS = new Set(['sql','postgresql','mysql','mongodb','redis','sqlite','dynamodb','elasticsearch']);
const CLOUD_TOOL_SKILLS = new Set(['aws','gcp','azure','docker','kubernetes','terraform','ci/cd','git','github actions','vercel','cloudflare']);
const ARCHITECTURE_SKILLS = new Set(['rest','graphql','microservices','socket.io','websockets']);
const SKILL_ALIASES = new Map([
  ['react.js', 'React'],
  ['reactjs', 'React'],
  ['nextjs', 'Next.js'],
  ['node', 'Node.js'],
  ['nodejs', 'Node.js'],
  ['postgres', 'PostgreSQL'],
  ['postgresql', 'PostgreSQL'],
  ['rest api', 'REST'],
  ['rest APIs', 'REST'],
  ['web sockets', 'WebSockets']
]);

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

const canonicalSkill = (skill) => {
  const raw = String(skill || '').trim();
  if (!raw) return '';
  const direct = SKILL_ALIASES.get(raw.toLowerCase());
  if (direct) return direct;
  return raw;
};

const technicalGroupFor = (skill) => {
  const key = canonicalSkill(skill).toLowerCase();
  if (LANGUAGE_SKILLS.has(key)) return 'Languages';
  if (FRAMEWORK_SKILLS.has(key)) return 'Frameworks / Libraries';
  if (DATABASE_SKILLS.has(key)) return 'Databases';
  if (ARCHITECTURE_SKILLS.has(key)) return 'APIs / Architecture';
  if (CLOUD_TOOL_SKILLS.has(key)) return 'Cloud / Tools';
  return null;
};

const addUnique = (chosen, evidence, maximumClaims) => {
  if (!evidence || chosen.length >= maximumClaims || chosen.some((item) => item.id === evidence.id)) return false;
  chosen.push(evidence);
  return true;
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
    const typeBonus = type === 'experience' ? 3 : type === 'project' ? 2.5 : type === 'achievement' ? 3 : 0;
    return { evidence, type, score: (matchCounts.get(evidence.id) || 0) * 10 + skillHits * 3 + typeBonus - index / 1000 };
  }).sort((a, b) => b.score - a.score);

  const directlyMatched = new Set(matchCounts.keys());
  const eligible = profile.evidence.filter((item) => !['education', 'skill'].includes(normalizedType(item.type)));
  const minimumClaims = Math.min(10, eligible.length);
  const maximumClaims = Math.min(16, eligible.length);
  const chosen = [];

  // Keep direct JD evidence while reserving room for the strongest projects/achievements on early-career profiles.
  const reservedBreadthSlots = Math.min(5, maximumClaims);
  const directCap = Math.max(1, maximumClaims - reservedBreadthSlots);
  for (const row of ranked) {
    if (chosen.length >= directCap) break;
    if (directlyMatched.has(row.evidence.id) && !['education', 'skill'].includes(row.type)) addUnique(chosen, row.evidence, maximumClaims);
  }

  // Guarantee project and achievement signal before employer bullets consume the remaining budget.
  for (const [type, floor] of [['achievement', 3], ['project', 2]]) {
    let count = chosen.filter((item) => normalizedType(item.type) === type).length;
    for (const row of ranked.filter((item) => item.type === type)) {
      if (count >= floor) break;
      if (addUnique(chosen, row.evidence, maximumClaims)) count++;
    }
  }

  // Every verified employer gets representation where capacity permits.
  const representedOrganizations = new Set(
    chosen.filter((item) => normalizedType(item.type) === 'experience')
      .map((item) => String(item.organization || '').toLowerCase()).filter(Boolean)
  );
  for (const row of ranked.filter((item) => item.type === 'experience' && item.evidence.organization)) {
    const organization = String(row.evidence.organization).toLowerCase();
    if (!representedOrganizations.has(organization) && addUnique(chosen, row.evidence, maximumClaims)) representedOrganizations.add(organization);
  }

  // Fill remaining capacity by relevance, excluding education and skill-only rows from claim sections.
  for (const row of ranked) {
    if (chosen.length >= Math.max(minimumClaims, maximumClaims)) break;
    if (!['education', 'skill'].includes(row.type)) addUnique(chosen, row.evidence, maximumClaims);
  }

  const technicalSkills = [];
  const seenSkills = new Set();
  for (const skill of chosen.flatMap((evidence) => evidence.skills || [])) {
    const canonical = canonicalSkill(skill);
    const key = canonical.toLowerCase();
    if (!technicalGroupFor(canonical) || seenSkills.has(key)) continue;
    seenSkills.add(key);
    technicalSkills.push(canonical);
  }
  technicalSkills.sort((a, b) => Number(jd.includes(String(b).toLowerCase())) - Number(jd.includes(String(a).toLowerCase())));

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
  organization: evidence.organization || evidence.company || evidence.employer || null,
  title: evidence.role || evidence.position || evidence.jobTitle || evidence.title || null,
  type: normalizedType(evidence.type),
  period: evidence.period || evidence.dateRange || evidence.dates || evidence.date || evidence.duration || null,
  location: evidence.location || evidence.workLocation || evidence.city || null,
  evidenceUrl: evidence.evidenceUrl || evidence.url || evidence.link || null,
  skills: (evidence.skills || []).map(canonicalSkill).filter(Boolean)
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
      degree: evidence.title || evidence.degree || evidence.fact,
      institution: evidence.organization || evidence.institution || '',
      period: evidence.period || evidence.dateRange || evidence.dates || evidence.date || null,
      location: evidence.location || evidence.city || null,
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
