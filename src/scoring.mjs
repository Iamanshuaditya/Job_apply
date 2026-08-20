const DEFAULT_WEIGHTS = {
  roleAlignment: 15, mustHaveTechnology: 25, experienceAlignment: 15, responsibilityAlignment: 15,
  workModeLocation: 10, niceToHaveTechnology: 10, domainAlignment: 5, otherRequirements: 5
};

export function scoreFit({ job, analysis, matchedRequirements, preferences = {} }) {
  const weights = { ...DEFAULT_WEIGHTS, ...(preferences.scoreWeights || {}) };
  const must = matchedRequirements.filter((r) => r.kind !== 'nice-to-have');
  const nice = matchedRequirements.filter((r) => r.kind === 'nice-to-have');
  const coverage = must.length ? must.filter((r) => r.status === 'met').length / must.length : 1;
  const niceCoverage = nice.length ? nice.filter((r) => r.status === 'met').length / nice.length : 1;
  const roleAlignment = analysis.roleFamily === 'full-stack' ? weights.roleAlignment : Math.round(weights.roleAlignment * 0.5);
  const dimensions = {
    roleAlignment,
    mustHaveTechnology: Math.round(weights.mustHaveTechnology * coverage),
    experienceAlignment: weights.experienceAlignment,
    responsibilityAlignment: Math.round(weights.responsibilityAlignment * coverage),
    workModeLocation: weights.workModeLocation,
    niceToHaveTechnology: Math.round(weights.niceToHaveTechnology * niceCoverage),
    domainAlignment: weights.domainAlignment,
    otherRequirements: weights.otherRequirements
  };
  const score = Object.values(dimensions).reduce((a, b) => a + b, 0);
  const hardFailures = matchedRequirements.filter((r) => r.kind === 'hard-disqualifier' && r.status !== 'met').map((r) => r.requirement);
  const thresholds = { manual: 70, auto: 80, minimumMustHaveCoverage: 0.7, ...(preferences.thresholds || {}) };
  const insufficientCoverage = coverage < thresholds.minimumMustHaveCoverage;
  const route = hardFailures.length || insufficientCoverage ? 'skip' : score >= thresholds.auto ? 'qualified' : score >= thresholds.manual ? 'review' : 'skip';
  return { score, dimensions, mustHaveCoverage: coverage, hardFailures, insufficientCoverage, route };
}
