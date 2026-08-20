import { evidenceIndex, allVerifiedSkills } from './career.mjs';

const numbers = (text) => (String(text).match(/\b\d+(?:\.\d+)?%?\b/g) || []);

export function verifyResume({ profile, resume }) {
  const index = evidenceIndex(profile);
  const issues = [];
  const inspectClaim = (claim, location) => {
    const ids = claim.evidenceIds || [];
    if (!ids.length) issues.push({ claim: claim.text, location, type: 'unsupported-claim', severity: 'critical', evidence: [] });
    const evidence = ids.map((id) => index.get(id)).filter(Boolean);
    if (evidence.length !== ids.length) issues.push({ claim: claim.text, location, type: 'unknown-evidence-id', severity: 'critical', evidence: ids });
    const source = evidence.map((e) => e.fact).join(' ');
    for (const n of numbers(claim.text)) {
      if (!source.includes(n)) issues.push({ claim: claim.text, location, type: 'unsupported-metric', severity: 'critical', evidence: ids, metric: n });
    }
  };
  inspectClaim(resume.summary, 'summary');
  resume.claims.forEach((claim, i) => inspectClaim(claim, `claims.${i}`));
  const supportedSkills = new Set(allVerifiedSkills(profile).map((x) => x.toLowerCase()));
  for (const skill of resume.skills) if (!supportedSkills.has(skill.toLowerCase())) issues.push({ claim: skill, location: 'skills', type: 'unsupported-skill', severity: 'critical', evidence: [] });
  return { verdict: issues.some((i) => i.severity === 'critical') ? 'reject' : 'pass', issues };
}
