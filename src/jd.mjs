import { uniq } from './utils.mjs';

const KNOWN_SKILLS = ['React','Next.js','TypeScript','JavaScript','Node.js','Express','PostgreSQL','MySQL','MongoDB','Redis','Docker','AWS','GCP','Azure','GraphQL','Kubernetes','Socket.IO','WebSockets','Prisma','Supabase','Tailwind','Playwright','Vitest','Jest'];

export function analyzeJD(job) {
  if (job.requirements?.length) {
    return {
      roleFamily: /full.?stack|product engineer|web engineer/i.test(`${job.title} ${job.description}`) ? 'full-stack' : 'software',
      title: job.title,
      seniority: inferSeniority(job.title),
      workMode: job.workMode,
      locations: job.locations,
      employmentType: job.employmentType,
      requirements: job.requirements.map((r) => typeof r === 'string' ? { requirement: r, kind: 'must-have', skills: [r] } : r)
    };
  }
  const corpus = `${job.title}\n${job.description}`;
  const found = KNOWN_SKILLS.filter((skill) => corpus.toLowerCase().includes(skill.toLowerCase()));
  return {
    roleFamily: /full.?stack|product engineer|web engineer/i.test(corpus) ? 'full-stack' : 'software',
    title: job.title,
    seniority: inferSeniority(job.title),
    workMode: job.workMode,
    locations: job.locations,
    employmentType: job.employmentType,
    requirements: uniq(found).map((skill) => ({ requirement: `${skill} experience`, kind: 'must-have', skills: [skill] }))
  };
}

function inferSeniority(title) {
  if (/staff|principal/i.test(title)) return 'staff';
  if (/senior|sr\.?/i.test(title)) return 'senior';
  if (/junior|jr\.?|entry/i.test(title)) return 'junior';
  return 'mid';
}
