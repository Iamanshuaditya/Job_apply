import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './utils.mjs';
import path from 'node:path';

function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ' '); }

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

export async function renderResumePdf(resume, file) {
  await ensureDir(path.dirname(file));
  const lines = resumeLines(resume).slice(0, 46);
  let y = 760;
  const ops = ['BT', '/F1 10 Tf'];
  for (const line of lines) { ops.push(`1 0 0 1 50 ${y} Tm (${esc(line)}) Tj`); y -= 15; }
  ops.push('ET');
  const stream = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await writeFile(file, pdf, 'binary');
  return file;
}

export async function extractPdfText(file) {
  const pdf = await readFile(file, 'latin1');
  return [...pdf.matchAll(/\((.*?)(?<!\\)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}

export async function validatePdf(file, resume) {
  const buf = await readFile(file);
  const text = await extractPdfText(file);
  const required = [resume.identity.name, 'TARGETED SUMMARY', 'TECHNICAL SKILLS', 'EXPERIENCE / PROJECT EVIDENCE', 'EDUCATION'];
  const missing = required.filter((x) => !text.includes(x));
  return { valid: buf.length > 300 && buf.subarray(0, 8).toString() === '%PDF-1.4' && missing.length === 0, bytes: buf.length, pages: 1, missing, text };
}
