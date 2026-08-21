import { uniq } from './utils.mjs';

const KNOWN_SKILLS = ['React','React.js','Next.js','TypeScript','JavaScript','Node.js','Express','PostgreSQL','MySQL','MongoDB','Redis','Docker','AWS','GCP','Azure','GraphQL','Kubernetes','Socket.IO','WebSockets','Prisma','Supabase','Tailwind','Playwright','Vitest','Jest','Python','Java','Go','C++','React Native','Flutter','Kotlin','Swift','Terraform','CI/CD','REST','Microservices'];

const ROLE_RULES = [
  ['marketing', /marketing|growth marketer|content marketer|brand|seo|sem/i],
  ['sales', /sales|business development|account executive|bdr|sdr|revenue|gtm lead|go-to-market/i],
  ['recruiting', /recruit|talent acquisition|people operations|human resources|\bhr\b/i],
  ['finance', /finance|accounting|controller|financial analyst/i],
  ['design', /designer|product design|ux|ui designer/i],
  ['mobile', /mobile engineer|android|ios|react native|flutter|kotlin|swift/i],
  ['data', /data engineer|machine learning|ml engineer|ai engineer|research engineer|data scientist/i],
  ['devops', /devops|site reliability|\bsre\b|platform engineer|infrastructure engineer/i],
  ['frontend', /front.?end|frontend|ui engineer/i],
  ['backend', /back.?end|backend|api engineer/i],
  ['full-stack', /full.?stack|product engineer|web engineer/i],
  ['software', /software engineer|developer|engineering/i]
];

export function inferRoleFamily(value = '') {
  for (const [family, pattern] of ROLE_RULES) if (pattern.test(value)) return family;
  return 'other';
}

function inferSeniority(title) {
  if (/staff|principal|distinguished/i.test(title)) return 'staff';
  if (/lead|manager|head of|director|vp\b/i.test(title)) return 'lead';
  if (/senior|sr\.?/i.test(title)) return 'senior';
  if (/junior|jr\.?|entry|new grad|graduate|intern/i.test(title)) return 'junior';
  return 'mid';
}

const kindForLine = (line) => /nice to have|preferred|bonus|plus\b|ideally/i.test(line) ? 'nice-to-have' : /must|required|requirement|minimum|need to|you have|you bring/i.test(line) ? 'must-have' : 'responsibility';
const categoryForLine = (line, skills) => skills.length ? 'technology' : /years? of experience|experience (?:in|with)|senior|staff|lead/i.test(line) ? 'experience' : /build|design|own|develop|implement|collaborate|ship|deliver|maintain|lead/i.test(line) ? 'responsibility' : 'other';

function extractRequirements(corpus) {
  const chunks = String(corpus).split(/\n|[•●▪◦]|(?<=[.!?;])\s+/).map((x) => x.replace(/^[-*]\s*/, '').trim()).filter((x) => x.length >= 8 && x.length <= 320);
  const requirements = [];
  for (const line of chunks) {
    const skills = uniq(KNOWN_SKILLS.filter((skill) => line.toLowerCase().includes(skill.toLowerCase())));
    if (!skills.length && !/must|required|preferred|experience|responsib|build|design|develop|implement|collaborate|ship|deliver|maintain|lead/i.test(line)) continue;
    requirements.push({ requirement: line, kind: kindForLine(line), category: categoryForLine(line, skills), skills });
  }
  if (!requirements.length) {
    const skills = uniq(KNOWN_SKILLS.filter((skill) => corpus.toLowerCase().includes(skill.toLowerCase())));
    return skills.map((skill) => ({ requirement: `${skill} experience`, kind: 'must-have', category: 'technology', skills: [skill] }));
  }
  return requirements.slice(0, 40);
}

export function analyzeJD(job) {
  const corpus = `${job.title}\n${job.description || ''}`;
  const requirements = job.requirements?.length
    ? job.requirements.map((r) => typeof r === 'string'
      ? { requirement: r, kind: 'must-have', category: 'other', skills: KNOWN_SKILLS.filter((skill) => r.toLowerCase().includes(skill.toLowerCase())) }
      : { category: r.category || categoryForLine(r.requirement || '', r.skills || []), kind: r.kind || 'must-have', skills: r.skills || [], ...r })
    : extractRequirements(corpus);
  return {
    roleFamily: inferRoleFamily(corpus),
    title: job.title,
    seniority: inferSeniority(job.title),
    workMode: job.workMode,
    locations: job.locations,
    employmentType: job.employmentType,
    requirements
  };
}
