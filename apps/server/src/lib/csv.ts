/** RFC 4180 CSV: quoted fields, embedded commas, quotes and newlines; CRLF or LF. */

/** `delimiter` defaults to comma; tab and semicolon files are common exports too. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const needsQuote = /[",\r\n]|^\s|\s$/;
/** Leading =, +, -, @ are prefixed with ' so spreadsheets don't run them as formulas. */
const formula = /^[=+\-@\t\r]/;

/** Guess the delimiter from the first non-empty line. */
export function sniffDelimiter(text: string): ',' | '\t' | ';' {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (ch: string) => line.split(ch).length - 1;
  const tabs = count('\t');
  const semis = count(';');
  const commas = count(',');
  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function toCsvField(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (typeof value === 'string' && formula.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function stringifyCsv(rows: unknown[][]): string {
  return `${rows.map((r) => r.map(toCsvField).join(',')).join('\r\n')}\r\n`;
}
