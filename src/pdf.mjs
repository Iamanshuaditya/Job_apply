import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ensureDir } from './utils.mjs';
import path from 'node:path';

const htmlEscape = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (value) => { try { const url = new URL(value); return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.toString() : null; } catch { return null; } };
const link = (label, href) => href ? `<a href="${htmlEscape(href)}">${htmlEscape(label)}</a>` : htmlEscape(label);
const periodOf = (item = {}) => item.period || item.dateRange || item.dates || item.date || item.duration || '';
const sectionClaims = (resume, key, type) => resume[key] || (resume.claims || []).filter((claim) => claim.type === type);
const normalizedKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function resumeLines(resume) {
  const experience = sectionClaims(resume, 'experience', 'experience');
  const projects = sectionClaims(resume, 'projects', 'project');
  const achievements = sectionClaims(resume, 'achievements', 'achievement');
  const certifications = (resume.claims || []).filter((claim) => claim.type === 'certification');
  const additional = (resume.claims || []).filter((claim) => !['experience', 'project', 'achievement', 'education', 'skill', 'certification'].includes(claim.type));
  const lines = [
    resume.identity.name,
    [resume.identity.email, resume.identity.phone, resume.identity.location].filter(Boolean).join(' | ')
  ];
  if (resume.skills?.length) lines.push('TECHNICAL SKILLS', resume.skills.join(' | '));
  if (experience.length) lines.push('EXPERIENCE', ...experience.map((claim) => `- ${claim.text}`));
  if (projects.length) lines.push('PROJECTS', ...projects.map((claim) => `- ${claim.text}`));
  if (achievements.length) lines.push('ACHIEVEMENTS', ...achievements.map((claim) => `- ${claim.text}`));
  if (certifications.length) lines.push('CERTIFICATIONS', ...certifications.map((claim) => `- ${claim.text}`));
  if (additional.length) lines.push('ADDITIONAL', ...additional.map((claim) => `- ${claim.text}`));
  if (resume.education?.length) lines.push('EDUCATION', ...resume.education.map((item) => `${item.degree || item.title || ''} ${item.institution || item.organization || ''} ${periodOf(item)}`.trim()));
  return lines.filter(Boolean);
}

const experienceGroups = (claims) => {
  const groups = [];
  const byKey = new Map();
  for (const claim of claims) {
    const key = [claim.organization || '', claim.title || '', periodOf(claim), claim.location || ''].map(normalizedKey).join('|');
    let group = byKey.get(key);
    if (!group) {
      group = {
        organization: claim.organization || 'Experience',
        title: claim.title || '',
        period: periodOf(claim),
        location: claim.location || '',
        claims: []
      };
      byKey.set(key, group);
      groups.push(group);
    }
    if (!group.claims.some((item) => normalizedKey(item.text) === normalizedKey(claim.text))) group.claims.push(claim);
  }
  return groups;
};

const projectGroups = (claims) => {
  const groups = [];
  const byKey = new Map();
  for (const claim of claims) {
    const name = claim.title || claim.organization || 'Project';
    const key = normalizedKey(name);
    let group = byKey.get(key);
    if (!group) {
      group = { name, href: claim.evidenceUrl || null, period: periodOf(claim), skills: [], claims: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    if (!group.href && claim.evidenceUrl) group.href = claim.evidenceUrl;
    if (!group.period && periodOf(claim)) group.period = periodOf(claim);
    for (const skill of claim.skills || []) if (!group.skills.some((item) => normalizedKey(item) === normalizedKey(skill))) group.skills.push(skill);
    if (!group.claims.some((item) => normalizedKey(item.text) === normalizedKey(claim.text))) group.claims.push(claim);
  }
  return groups;
};

const renderSection = (title, body) => body ? `<section><h2>${title}</h2>${body}</section>` : '';

function resumeHtml(resume) {
  const identity = resume.identity || {};
  const contacts = [
    identity.email ? link(identity.email, `mailto:${identity.email}`) : null,
    identity.phone ? link(identity.phone, `tel:${identity.phone}`) : null,
    identity.location ? htmlEscape(identity.location) : null,
    identity.linkedin ? link('LinkedIn', safeHref(identity.linkedin)) : null,
    identity.github ? link('GitHub', safeHref(identity.github)) : null,
    identity.portfolio ? link('Portfolio', safeHref(identity.portfolio)) : null
  ].filter(Boolean).join('<span class="sep">|</span>');

  const skillGroups = Object.entries(resume.skillGroups || {}).filter(([, skills]) => Array.isArray(skills) && skills.length);
  const skillBody = skillGroups.length
    ? skillGroups.map(([group, skills]) => `<div class="skill-row"><strong>${htmlEscape(group)}:</strong><span>${skills.map(htmlEscape).join(', ')}</span></div>`).join('')
    : (resume.skills?.length ? `<div class="skill-row"><strong>Technologies:</strong><span>${resume.skills.map(htmlEscape).join(', ')}</span></div>` : '');

  const experience = sectionClaims(resume, 'experience', 'experience');
  const experienceBody = experienceGroups(experience).map((group) => `
    <div class="entry">
      <div class="entry-row"><strong>${htmlEscape(group.organization)}</strong><strong class="right">${htmlEscape(group.period)}</strong></div>
      ${(group.title || group.location) ? `<div class="entry-row sub"><em>${htmlEscape(group.title)}</em><em class="right">${htmlEscape(group.location)}</em></div>` : ''}
      <ul>${group.claims.map((claim) => `<li>${htmlEscape(claim.text)}</li>`).join('')}</ul>
    </div>`).join('');

  const projects = sectionClaims(resume, 'projects', 'project');
  const projectBody = projectGroups(projects).map((group) => `
    <div class="entry project">
      <div class="entry-row"><strong>${link(group.name, safeHref(group.href))}</strong><strong class="right">${htmlEscape(group.period)}</strong></div>
      ${group.skills.length ? `<div class="project-tech">${htmlEscape(group.skills.join(', '))}</div>` : ''}
      <ul>${group.claims.map((claim) => `<li>${htmlEscape(claim.text)}</li>`).join('')}</ul>
    </div>`).join('');

  const achievements = sectionClaims(resume, 'achievements', 'achievement');
  const achievementBody = achievements.length ? `<ul>${achievements.map((claim) => `<li>${htmlEscape(claim.text)}${periodOf(claim) ? ` <span class="inline-date">(${htmlEscape(periodOf(claim))})</span>` : ''}</li>`).join('')}</ul>` : '';

  const certifications = (resume.claims || []).filter((claim) => claim.type === 'certification');
  const certificationBody = certifications.length ? `<ul>${certifications.map((claim) => `<li>${htmlEscape(claim.text)}${periodOf(claim) ? ` <span class="inline-date">(${htmlEscape(periodOf(claim))})</span>` : ''}</li>`).join('')}</ul>` : '';

  const additional = (resume.claims || []).filter((claim) => !['experience', 'project', 'achievement', 'education', 'skill', 'certification'].includes(claim.type));
  const additionalBody = additional.length ? `<ul>${additional.map((claim) => `<li>${htmlEscape(claim.text)}</li>`).join('')}</ul>` : '';

  const educationBody = (resume.education || []).map((item) => `
    <div class="entry education">
      <div class="entry-row"><strong>${htmlEscape(item.institution || item.organization || '')}</strong><strong class="right">${htmlEscape(periodOf(item))}</strong></div>
      <div class="entry-row sub"><em>${htmlEscape(item.degree || item.title || '')}</em><em class="right">${htmlEscape(item.location || '')}</em></div>
    </div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 11.5mm 14mm 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 9.4pt; line-height: 1.24; overflow-wrap: anywhere; }
    a { color: inherit; text-decoration: underline; text-decoration-thickness: .45px; text-underline-offset: 1px; }
    header { text-align: center; margin-bottom: 7px; }
    h1 { font-size: 19pt; line-height: 1.05; margin: 0 0 3px; font-weight: 700; letter-spacing: .2px; }
    .contacts { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 6px; font-size: 8.45pt; }
    .sep { color: #555; }
    section { margin-top: 7px; }
    h2 { font-size: 9.8pt; margin: 0 0 3px; padding-bottom: 1px; border-bottom: .8px solid #111; letter-spacing: .45px; font-weight: 700; }
    .skill-row { display: grid; grid-template-columns: 31mm minmax(0, 1fr); gap: 4px; margin: 1px 0; }
    .entry { margin: 0 0 4px; break-inside: avoid; }
    .entry-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; }
    .entry-row.sub { margin-top: 0; font-size: 8.9pt; }
    .right { text-align: right; white-space: nowrap; }
    ul { margin: 1px 0 0; padding-left: 15px; }
    li { margin: 0 0 1.7px; }
    .project-tech { font-size: 8.65pt; font-style: italic; margin-top: 0; }
    .inline-date { color: #444; font-size: 8.6pt; }
  </style></head><body>
    <header><h1>${htmlEscape(identity.name || '')}</h1><div class="contacts">${contacts}</div></header>
    ${renderSection('TECHNICAL SKILLS', skillBody)}
    ${renderSection('EXPERIENCE', experienceBody)}
    ${renderSection('PROJECTS', projectBody)}
    ${renderSection('ACHIEVEMENTS', achievementBody)}
    ${renderSection('CERTIFICATIONS', certificationBody)}
    ${renderSection('ADDITIONAL', additionalBody)}
    ${renderSection('EDUCATION', educationBody)}
  </body></html>`;
}

const sourceFileFor = (file) => file.replace(/\.pdf$/i, '.source.html');
const layoutFileFor = (file) => file.replace(/\.pdf$/i, '.layout.json');

export async function renderResumePdf(resume, file) {
  await ensureDir(path.dirname(file));
  const html = resumeHtml(resume);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      textLength: document.body.innerText.length
    }));
    await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await Promise.all([
      writeFile(sourceFileFor(file), html, 'utf8'),
      writeFile(layoutFileFor(file), JSON.stringify(layout, null, 2), 'utf8')
    ]);
  } finally {
    await browser.close();
  }
  return file;
}

const stripHtml = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&bull;|&#8226;/g, '•').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n\s*\n+/g, '\n').trim();

export async function extractPdfText(file) {
  try { return stripHtml(await readFile(sourceFileFor(file), 'utf8')); }
  catch {
    const pdf = await readFile(file, 'latin1');
    return [...pdf.matchAll(/\((.*?)(?<!\\)\) Tj/g)].map((match) => match[1].replace(/\\([()\\])/g, '$1')).join('\n');
  }
}

export async function validatePdf(file, resume) {
  const buf = await readFile(file);
  const text = await extractPdfText(file);
  const experience = sectionClaims(resume, 'experience', 'experience');
  const projects = sectionClaims(resume, 'projects', 'project');
  const achievements = sectionClaims(resume, 'achievements', 'achievement');
  const required = [resume.identity.name];
  if (resume.skills?.length) required.push('TECHNICAL SKILLS');
  if (experience.length) required.push('EXPERIENCE');
  if (projects.length) required.push('PROJECTS');
  if (achievements.length) required.push('ACHIEVEMENTS');
  if (resume.education?.length) required.push('EDUCATION');
  const missing = required.filter((value) => !text.includes(value));
  let layout = { horizontalOverflow: false, textLength: text.length };
  try { layout = JSON.parse(await readFile(layoutFileFor(file), 'utf8')); } catch {}
  const pdfText = buf.toString('latin1');
  const pages = Math.max(1, (pdfText.match(/\/Type\s*\/Page\b/g) || []).length);
  const minimumClaims = Math.min(3, resume.claims.length);
  const presentClaims = resume.claims.filter((claim) => text.includes(claim.text)).length;
  const valid = buf.length > 1000 && buf.subarray(0, 5).toString() === '%PDF-' && missing.length === 0 && !layout.horizontalOverflow && presentClaims >= minimumClaims;
  return { valid, bytes: buf.length, pages, missing, text, layout, presentClaims, minimumClaims };
}
