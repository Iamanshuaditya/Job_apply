import { inferRoleFamily } from './jd.mjs';

const DEFAULT_WEIGHTS = {
  roleAlignment: 15, mustHaveTechnology: 25, experienceAlignment: 15, responsibilityAlignment: 15,
  workModeLocation: 10, niceToHaveTechnology: 10, domainAlignment: 5, otherRequirements: 5
};

const SOFTWARE_FAMILIES = new Set(['full-stack','frontend','backend','mobile','data','devops','software']);
const compatibleFamilies = (target, actual) => {
  if (target === actual) return 1;
  if (target === 'full-stack' && ['frontend','backend','software'].includes(actual)) return 0.75;
  if (actual === 'full-stack' && ['frontend','backend','software'].includes(target)) return 0.75;
  if (SOFTWARE_FAMILIES.has(target) && SOFTWARE_FAMILIES.has(actual)) return 0.45;
  return 0;
};

const coverage = (rows) => rows.length ? rows.filter((r) => r.status === 'met').length / rows.length : null;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function scoreFit({ job, analysis, matchedRequirements, preferences = {} }) {
  const weights = { ...DEFAULT_WEIGHTS, ...(preferences.scoreWeights || {}) };
  const targetFamilies = (preferences.targetTitles || []).map(inferRoleFamily).filter((x) => x !== 'other');
  const roleRatio = targetFamilies.length ? Math.max(...targetFamilies.map((family) => compatibleFamilies(family, analysis.roleFamily))) : (SOFTWARE_FAMILIES.has(analysis.roleFamily) ? 1 : 0);

  const mustTech = matchedRequirements.filter((r) => r.kind !== 'nice-to-have' && r.category === 'technology');
  const niceTech = matchedRequirements.filter((r) => r.kind === 'nice-to-have' && r.category === 'technology');
  const experience = matchedRequirements.filter((r) => r.kind !== 'nice-to-have' && r.category === 'experience');
  const responsibilities = matchedRequirements.filter((r) => r.kind !== 'nice-to-have' && r.category === 'responsibility');
  const other = matchedRequirements.filter((r) => r.kind !== 'nice-to-have' && !['technology','experience','responsibility'].includes(r.category));

  const locationRatio = preferences.workModes?.length && job.workMode !== 'unknown'
    ? (preferences.workModes.some((x) => String(x).toLowerCase() === String(job.workMode).toLowerCase()) ? 1 : 0)
    : null;

  const ratios = {
    roleAlignment: roleRatio,
    mustHaveTechnology: coverage(mustTech),
    experienceAlignment: coverage(experience),
    responsibilityAlignment: coverage(responsibilities),
    workModeLocation: locationRatio,
    niceToHaveTechnology: coverage(niceTech),
    domainAlignment: null,
    otherRequirements: coverage(other)
  };

  const applicable = Object.entries(ratios).filter(([, ratio]) => ratio != null);
  const denominator = applicable.reduce((sum, [key]) => sum + (weights[key] || 0), 0) || 1;
  const dimensions = {};
  for (const [key, ratio] of Object.entries(ratios)) {
    dimensions[key] = ratio == null ? { score: null, weight: weights[key], ratio: null, applicable: false } : {
      score: Math.round((weights[key] || 0) * clamp01(ratio) * 10) / 10,
      weight: weights[key], ratio: Math.round(clamp01(ratio) * 100) / 100, applicable: true
    };
  }
  const earned = applicable.reduce((sum, [key, ratio]) => sum + (weights[key] || 0) * clamp01(ratio), 0);
  const score = Math.round((earned / denominator) * 100);

  const hardFailures = matchedRequirements.filter((r) => r.kind === 'hard-disqualifier' && r.status !== 'met').map((r) => r.requirement);
  if (roleRatio === 0) hardFailures.unshift(`role-family-mismatch:${analysis.roleFamily}`);
  const mustRows = matchedRequirements.filter((r) => r.kind !== 'nice-to-have');
  const mustHaveCoverage = coverage(mustRows) ?? 1;
  const thresholds = { manual: 70, auto: 80, minimumMustHaveCoverage: 0.7, ...(preferences.thresholds || {}) };
  const insufficientCoverage = mustRows.length > 0 && mustHaveCoverage < thresholds.minimumMustHaveCoverage;
  const route = hardFailures.length || insufficientCoverage ? 'skip' : score >= thresholds.auto ? 'qualified' : score >= thresholds.manual ? 'review' : 'skip';
  return { score, dimensions, mustHaveCoverage, hardFailures, insufficientCoverage, route, roleFamily: analysis.roleFamily };
}
