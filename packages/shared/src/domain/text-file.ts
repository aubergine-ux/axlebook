/**
 * Decode an uploaded text file (CSV/TSV). Most are UTF-8, but Excel on Windows saves "CSV" in
 * the system code page, so anything that isn't valid UTF-8 is read as Windows-1252 instead of
 * turning "Café" into "Caf�". Returns null for files that are clearly not text.
 */
export function decodeTextFile(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  // A trailing Ctrl-Z is an old DOS end-of-file marker; other control characters mean binary.
  while (text.endsWith('\u001a')) text = text.slice(0, -1);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: detecting binary files
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) return null;
  return text;
}
