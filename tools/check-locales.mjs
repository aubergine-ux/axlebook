// Checks every locale against English: the same keys, the same {{placeholders}} in each string,
// and nothing left empty. Run with `node tools/check-locales.mjs` (also part of `npm test`).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../packages/shared/locales');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
const load = (lang, file) =>
  new Map(flatten(JSON.parse(fs.readFileSync(path.join(root, lang, file), 'utf8'))));
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

/** Problems with one locale, as readable lines. Empty when it matches English. */
export function checkLocale(lang) {
  const problems = [];
  for (const file of fs.readdirSync(path.join(root, 'en'))) {
    if (!fs.existsSync(path.join(root, lang, file))) {
      problems.push(`${lang}/${file}: missing file`);
      continue;
    }
    const en = load('en', file);
    const other = load(lang, file);
    for (const [key, value] of en) {
      if (!other.has(key)) problems.push(`${lang}/${file}: missing ${key}`);
      else if (String(other.get(key)).trim() === '' && String(value).trim() !== '')
        problems.push(`${lang}/${file}: empty ${key}`);
      else if (placeholders(value).join() !== placeholders(other.get(key)).join())
        problems.push(
          `${lang}/${file}: ${key} has {{${placeholders(other.get(key))}}}, English has {{${placeholders(value)}}}`,
        );
    }
    for (const key of other.keys())
      if (!en.has(key)) problems.push(`${lang}/${file}: extra ${key}`);
  }
  return problems;
}

export const locales = () =>
  fs.readdirSync(root).filter((d) => d !== 'en' && fs.statSync(path.join(root, d)).isDirectory());

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = locales().flatMap(checkLocale);
  for (const p of problems) console.error(p);
  console.log(`${locales().length} locale(s) checked against en: ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
