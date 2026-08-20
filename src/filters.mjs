const includesCI = (values, value) => values.some((x) => String(x).toLowerCase() === String(value).toLowerCase());

export function hardFilter(job, preferences = {}, profile = {}) {
  const reasons = [];
  if (job.status !== 'active') reasons.push(`posting-${job.status}`);
  if (includesCI(preferences.excludedCompanies || [], job.company)) reasons.push('excluded-company');
  if ((preferences.excludedTitles || []).some((x) => job.title.toLowerCase().includes(x.toLowerCase()))) reasons.push('excluded-title');
  if (preferences.employmentTypes?.length && !includesCI(preferences.employmentTypes, job.employmentType)) reasons.push('employment-type');
  if (preferences.workModes?.length && job.workMode !== 'unknown' && !includesCI(preferences.workModes, job.workMode)) reasons.push('work-mode');
  if (preferences.excludedLocations?.length && job.locations.some((l) => includesCI(preferences.excludedLocations, l))) reasons.push('excluded-location');
  if (job.authorization?.requires && !(profile.eligibility?.authorizations || []).includes(job.authorization.requires)) reasons.push('authorization');

  const targetTitles = preferences.targetTitles || [];
  if (targetTitles.length) {
    const corpus = `${job.title} ${job.description}`.toLowerCase();
    const relevant = targetTitles.some((t) => corpus.includes(t.toLowerCase())) || (preferences.targetSkills || []).some((s) => corpus.includes(s.toLowerCase()));
    if (!relevant) reasons.push('title-and-jd-irrelevant');
  }
  return { pass: reasons.length === 0, reasons };
}
