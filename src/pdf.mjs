import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ensureDir } from './utils.mjs';
import path from 'node:path';

const htmlEscape = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (value) => { try { const url = new URL(value); return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.toString() : null; } catch { return null; } };
const link = (label, href) => href ? `<a href="${htmlEscape(href)}">${htmlEscape(label)}</a>` : htmlEscape(label);

export function resumeLines(resume) {
  return [
    resume.identity.name,
    [resume.identity.email, resume.identity.phone, resume.identity.location].filter(Boolean).join(' | '),
    'TARGETED SUMMARY', resume.summary.text,
    'TECHNICAL SKILLS', resume.skills.join(' | '),
    'EXPERIENCE / PROJECT EVIDENCE', ...resume.claims.map((c) => `- ${c.text}`),
    'EDUCATION', ...(resume.education.length ? resume.education.map((e) => `${e.degree || ''} ${e.institution || ''}`.trim()) : ['Available on request'])
  ].filter(Boolean);
}

function resumeHtml(resume) {
  const identity = resume.identity || {};
  const contacts = [
    identity.email ? link(identity.email, `mailto:${identity.email}`) : null,
    identity.phone ? link(identity.phone, `tel:${identity.phone}`) : null,
    identity.location ? htmlEscape(identity.location) : null,
    identity.linkedin ? link('LinkedIn', safeHref(identity.linkedin)) : null,
    identity.github ? link('GitHub', safeHref(identity.github)) : null,
    identity.portfolio ? link('Portfolio', safeHref(identity.portfolio)) : null
  ].filter(Boolean).join('<span class="sep">•</span>');
  const claims = resume.claims.map((claim) => `<li>${claim.organization ? `<div class="claim-head"><strong>${htmlEscape(claim.organization)}</strong>${claim.title ? `<span>${htmlEscape(claim.title)}</span>` : ''}</div>` : ''}<div>${htmlEscape(claim.text)}</div></li>`).join('');
  const education = resume.education.length ? resume.education.map((item) => `<div class="education"><strong>${htmlEscape(item.degree || item.title || '')}</strong><span>${htmlEscape(item.institution || item.organization || '')}</span>${item.date || item.dates ? `<span class="date">${htmlEscape(item.date || item.dates)}</span>` : ''}</div>`).join('') : '<div class="muted">Available on request</div>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 13mm 15mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 9.6pt; line-height: 1.28; overflow-wrap: anywhere; }
    a { color: inherit; text-decoration: underline; text-decoration-thickness: .5px; text-underline-offset: 1.5px; }
    header { text-align: center; margin-bottom: 10px; }
    h1 { font-size: 19pt; letter-spacing: .2px; margin: 0 0 4px; font-weight: 700; }
    .contacts { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px 7px; font-size: 8.7pt; }
    .sep { color: #777; }
    section { margin-top: 9px; break-inside: auto; }
    h2 { font-size: 10pt; margin: 0 0 5px; padding-bottom: 2px; border-bottom: 1px solid #222; letter-spacing: .55px; font-weight: 700; }
    p { margin: 0; }
    .skills { display: flex; flex-wrap: wrap; gap: 3px 6px; }
    .skill:not(:last-child)::after { content: ' •'; color: #777; }
    ul { margin: 0; padding-left: 16px; }
    li { margin: 0 0 5px; break-inside: avoid; }
    .claim-head, .education { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: baseline; margin-bottom: 1px; }
    .claim-head span, .education span { text-align: right; color: #333; font-style: italic; }
    .education { position: relative; margin-bottom: 4px; }
    .education .date { grid-column: 2; }
    .muted { color: #555; }
  </style></head><body>
    <header><h1>${htmlEscape(identity.name || '')}</h1><div class="contacts">${contacts}</div></header>
    <section><h2>TARGETED SUMMARY</h2><p>${htmlEscape(resume.summary.text)}</p></section>
    <section><h2>TECHNICAL SKILLS</h2><div class="skills">${resume.skills.map((skill) => `<span class="skill">${htmlEscape(skill)}</span>`).join('')}</div></section>
    <section><h2>EXPERIENCE / PROJECT EVIDENCE</h2><ul>${claims}</ul></section>
    <section><h2>EDUCATION</h2>${education}</section>
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
    return [...pdf.matchAll(/\((.*?)(?<!\\)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
  }
}

export async function validatePdf(file, resume) {
  const buf = await readFile(file);
  const text = await extractPdfText(file);
  const required = [resume.identity.name, 'TARGETED SUMMARY', 'TECHNICAL SKILLS', 'EXPERIENCE / PROJECT EVIDENCE', 'EDUCATION'];
  const missing = required.filter((x) => !text.includes(x));
  let layout = { horizontalOverflow: false, textLength: text.length };
  try { layout = JSON.parse(await readFile(layoutFileFor(file), 'utf8')); } catch {}
  const pdfText = buf.toString('latin1');
  const pages = Math.max(1, (pdfText.match(/\/Type\s*\/Page\b/g) || []).length);
  const minimumClaims = Math.min(3, resume.claims.length);
  const presentClaims = resume.claims.filter((claim) => text.includes(claim.text)).length;
  const valid = buf.length > 1000 && buf.subarray(0, 5).toString() === '%PDF-' && missing.length === 0 && !layout.horizontalOverflow && presentClaims >= minimumClaims;
  return { valid, bytes: buf.length, pages, missing, text, layout, presentClaims, minimumClaims };
}
