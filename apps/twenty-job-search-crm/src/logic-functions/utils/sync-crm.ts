import { CoreApiClient } from 'twenty-client-sdk/core';
import { orchestratorJson } from './orchestrator';

const csv = (value?: string | null) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
const sourceKind = (value?: string | null) => String(value ?? '').toLowerCase().replace(/_/g, '-');

const queryNodes = async (client: any, plural: string, fields: any) => {
  const result = await client.query({ [plural]: { __args: { first: 500 }, edges: { node: fields } } } as any);
  return (result?.[plural]?.edges ?? []).map((edge: any) => edge.node);
};

export const pushWorkspaceConfigToOrchestrator = async () => {
  const client = new CoreApiClient() as any;
  const [profiles, evidences, exclusions, sources] = await Promise.all([
    queryNodes(client, 'candidateProfiles', {
      id: true, name: true, email: true, phone: true, location: true, linkedin: true, github: true, portfolio: true,
      currentCompany: true, knowledgeBase: true, professionalSummary: true, workProgress: true, targetTitles: true,
      excludedTitles: true, targetSkills: true, excludedLocations: true, countries: true, minCompanySize: true,
      maxCompanySize: true, workModes: true, employmentTypes: true, manualThreshold: true, autoThreshold: true,
      authorizations: true
    }),
    queryNodes(client, 'careerEvidences', {
      id: true, title: true, evidenceType: true, organization: true, fact: true, skills: true, evidenceUrl: true, verified: true
    }),
    queryNodes(client, 'excludedCompanies', { name: true, aliases: true }),
    queryNodes(client, 'jobSources', { name: true, kind: true, company: true, boardKey: true, region: true, enabled: true })
  ]);

  const profileRow = profiles[0];
  if (!profileRow) throw new Error('Create a Candidate Profile before running automation.');

  const excluded: any[] = exclusions.map((item: any) => ({ name: item.name, aliases: csv(item.aliases) }));
  if (profileRow.currentCompany?.trim()) excluded.push(profileRow.currentCompany.trim());

  const verified = evidences.filter((item: any) => item.verified && item.fact);
  const education = verified
    .filter((item: any) => String(item.evidenceType || '').toUpperCase() === 'EDUCATION')
    .map((item: any) => ({ degree: item.title || '', institution: item.organization || '', evidenceId: `crm-${item.id}` }));

  const profile = {
    version: `twenty-${new Date().toISOString()}`,
    identity: {
      name: profileRow.name,
      email: profileRow.email,
      phone: profileRow.phone,
      location: profileRow.location,
      linkedin: profileRow.linkedin,
      github: profileRow.github,
      portfolio: profileRow.portfolio
    },
    context: {
      professionalSummary: profileRow.professionalSummary || '',
      workProgress: profileRow.workProgress || '',
      knowledgeBase: profileRow.knowledgeBase || ''
    },
    eligibility: { authorizations: csv(profileRow.authorizations) },
    education,
    evidence: verified.map((item: any) => ({
      id: `crm-${item.id}`,
      title: item.title || null,
      type: String(item.evidenceType || 'OTHER').toLowerCase(),
      fact: item.fact,
      organization: item.organization || null,
      skills: csv(item.skills),
      evidenceUrl: item.evidenceUrl || null,
      verified: true
    }))
  };

  const preferences = {
    targetTitles: csv(profileRow.targetTitles),
    excludedTitles: csv(profileRow.excludedTitles),
    targetSkills: csv(profileRow.targetSkills),
    excludedCompanies: excluded,
    excludedLocations: csv(profileRow.excludedLocations),
    countries: csv(profileRow.countries),
    minCompanySize: profileRow.minCompanySize == null ? undefined : Number(profileRow.minCompanySize),
    maxCompanySize: profileRow.maxCompanySize == null ? undefined : Number(profileRow.maxCompanySize),
    workModes: csv(profileRow.workModes),
    employmentTypes: csv(profileRow.employmentTypes),
    thresholds: { manual: Number(profileRow.manualThreshold ?? 70), auto: Number(profileRow.autoThreshold ?? 80) }
  };

  const sourceConfig = sources
    .filter((item: any) => item.enabled !== false)
    .map((item: any) => {
      const kind = sourceKind(item.kind);
      return {
        name: item.name,
        kind,
        company: item.company,
        region: item.region || undefined,
        enabled: true,
        ...(kind === 'greenhouse' ? { boardToken: item.boardKey }
          : kind === 'lever' ? { site: item.boardKey }
            : kind === 'ashby' ? { boardName: item.boardKey }
              : { url: item.boardKey })
      };
    });

  await orchestratorJson('/api/config', { method: 'POST', body: { profile, preferences, sources: sourceConfig } });
};

export type Snapshot = { summary: Record<string, number>; jobs: any[]; runs: any[]; updatedAt?: string };

export const refreshSnapshot = async (): Promise<Snapshot> => {
  const snapshot = await orchestratorJson<Snapshot>('/api/snapshot');
  const client = new CoreApiClient() as any;
  const existing = await queryNodes(client, 'jobOpportunities', { id: true, jobId: true });
  const byId = new Map(existing.map((item: any) => [item.jobId, item]));

  for (const job of snapshot.jobs ?? []) {
    const data = {
      title: job.title,
      jobId: job.jobId,
      company: job.company,
      status: job.crmStatus,
      approval: job.approval ?? 'PENDING',
      fitScore: job.fitScore ?? undefined,
      source: job.source ?? '',
      locationText: (job.locations ?? []).join(', '),
      workMode: job.workMode ?? '',
      employmentType: job.employmentType ?? '',
      jobUrl: job.applicationUrl ?? job.canonicalUrl ?? '',
      description: job.description ?? '',
      resumeHash: job.resumeHash ?? '',
      resumePath: job.resumePath ?? '',
      applicationEmail: job.applicationEmail ?? '',
      postedAt: job.postedAt || undefined,
      discoveredAt: job.discoveredAt || job.firstSeenAt || undefined,
      appliedAt: job.appliedAt || undefined,
      confirmation: job.confirmation ? JSON.stringify(job.confirmation) : ''
    };
    const record: any = byId.get(job.jobId);
    if (record?.id) {
      await client.mutation({ updateJobOpportunity: { __args: { id: record.id, data }, id: true } } as any);
    } else {
      const result = await client.mutation({ createJobOpportunity: { __args: { data }, id: true } } as any);
      if (result?.createJobOpportunity?.id) byId.set(job.jobId, result.createJobOpportunity);
    }
  }

  return snapshot;
};
