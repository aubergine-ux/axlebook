import fs from 'node:fs';
import path from 'node:path';
import { ERROR_CODES } from '@axlebook/shared';
import { describe, expect, it } from 'vitest';

const localesDir = path.resolve(import.meta.dirname, '../../../../packages/shared/locales');
const srcDir = path.resolve(import.meta.dirname, '..');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

function loadNamespace(lang: string, ns: string): string[] {
  return flatten(JSON.parse(fs.readFileSync(path.join(localesDir, lang, `${ns}.json`), 'utf8')));
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|gen)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Keys used as `t('a.b')`, plus prefixes used as `t(`a.${x}`)` (dynamic keys). */
function usedKeys() {
  const literal = new Set<string>();
  const prefixes = new Set<string>();
  for (const file of sourceFiles(srcDir)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g)) literal.add(m[1] as string);
    for (const m of code.matchAll(/\bt\(\s*`([\w.-]*)\$\{/g)) prefixes.add(m[1] as string);
  }
  return { literal, prefixes };
}

const enKeys = loadNamespace('en', 'common');

describe('translations', () => {
  it('every key used in the web app exists in en', () => {
    const { literal } = usedKeys();
    const missing = [...literal].filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('every en key is used (literally, via a dynamic prefix, or as an API error code)', () => {
    const { literal, prefixes } = usedKeys();
    // Error messages are looked up dynamically from API error codes.
    prefixes.add('errors.');
    const unused = enKeys.filter(
      (k) => !literal.has(k) && ![...prefixes].some((p) => p && k.startsWith(p)),
    );
    expect(unused).toEqual([]);
  });

  it('has a message for every API error code', () => {
    const missing = ERROR_CODES.filter((c) => !enKeys.includes(`errors.${c}`));
    expect(missing).toEqual([]);
  });

  it('every other locale has exactly the en key set', () => {
    for (const lang of fs.readdirSync(localesDir).filter((l) => l !== 'en')) {
      const keys = loadNamespace(lang, 'common');
      expect({ lang, missing: enKeys.filter((k) => !keys.includes(k)) }).toEqual({
        lang,
        missing: [],
      });
      expect({ lang, extra: keys.filter((k) => !enKeys.includes(k)) }).toEqual({ lang, extra: [] });
    }
  });
});
