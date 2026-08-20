import { assert, sha256, uniq } from './utils.mjs';

export function validateCareerProfile(profile) {
  assert(profile && typeof profile === 'object', 'candidate profile must be an object');
  assert(profile.identity?.name, 'candidate identity.name is required');
  assert(Array.isArray(profile.evidence), 'candidate evidence must be an array');
  const ids = new Set();
  for (const item of profile.evidence) {
    assert(item.id && typeof item.id === 'string', 'every evidence item requires a stable id');
    assert(!ids.has(item.id), `duplicate evidence id: ${item.id}`);
    ids.add(item.id);
    assert(item.verified === true, `evidence ${item.id} must be explicitly verified`);
    assert(typeof item.fact === 'string' && item.fact.trim(), `evidence ${item.id} requires fact text`);
    assert(Array.isArray(item.skills), `evidence ${item.id} skills must be an array`);
  }
  return { ...profile, version: profile.version || sha256(JSON.stringify(profile)).slice(0, 12) };
}

export function evidenceIndex(profile) { return new Map(profile.evidence.map((item) => [item.id, item])); }
export function allVerifiedSkills(profile) { return uniq(profile.evidence.flatMap((e) => e.skills || [])); }

export function matchEvidence(profile, requirements) {
  const evidence = profile.evidence;
  return requirements.map((requirement) => {
    const needle = requirement.requirement.toLowerCase();
    const hits = evidence.filter((item) => {
      const corpus = `${item.fact} ${(item.skills || []).join(' ')}`.toLowerCase();
      return (requirement.skills || []).some((skill) => corpus.includes(skill.toLowerCase())) || corpus.includes(needle);
    });
    return {
      ...requirement,
      status: hits.length ? 'met' : 'missing',
      evidenceIds: hits.map((h) => h.id),
      confidence: hits.length ? 1 : 0.95
    };
  });
}
