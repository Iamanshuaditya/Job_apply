import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export async function ensureDir(dir) { await mkdir(dir, { recursive: true }); return dir; }
export async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function writeJson(file, value) { await ensureDir(path.dirname(file)); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
export async function appendNdjson(file, value) { await ensureDir(path.dirname(file)); await appendFile(file, JSON.stringify(value) + '\n'); }
export async function readNdjson(file) {
  try { return (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function uniq(values) { return [...new Set(values.filter(Boolean))]; }
export function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
