import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Stores files on the data volume under random keys. Keys never contain path separators. */
export class FileStore {
  constructor(private readonly dir: string) {}

  private resolve(key: string): string {
    if (!/^[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(key)) throw new Error(`invalid file key: ${key}`);
    return path.join(this.dir, key);
  }

  async save(data: Buffer, ext: string): Promise<string> {
    await fsp.mkdir(this.dir, { recursive: true });
    const key = `${randomUUID()}.${ext}`;
    await fsp.writeFile(this.resolve(key), data, { flag: 'wx' });
    return key;
  }

  /** Write under a known key (used by restore). */
  async write(key: string, data: Buffer): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.resolve(key), data);
  }

  stream(key: string): fs.ReadStream {
    return fs.createReadStream(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }
}

const IMAGE_SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

const DOC_SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  {
    ext: 'pdf',
    mime: 'application/pdf',
    test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    test: (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1')),
  },
  {
    ext: 'heic',
    mime: 'image/heic',
    test: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      /^(heic|heix|mif1|msf1|heif)$/.test(b.subarray(8, 12).toString('latin1')),
  },
];

/** Receipts and photos accepted as record attachments, identified by magic bytes. */
export function sniffAttachment(data: Buffer): { ext: string; mime: string } | null {
  return sniffImage(data) ?? DOC_SIGNATURES.find((s) => s.test(data)) ?? null;
}

/** Identify an image by its magic bytes (the client-sent MIME type is not trusted). */
export function sniffImage(data: Buffer): { ext: string; mime: string } | null {
  const hit = IMAGE_SIGNATURES.find((s) => s.test(data));
  return hit ? { ext: hit.ext, mime: hit.mime } : null;
}

export function mimeForKey(key: string): string {
  const ext = key.split('.').pop();
  return (
    [...IMAGE_SIGNATURES, ...DOC_SIGNATURES].find((s) => s.ext === ext)?.mime ??
    'application/octet-stream'
  );
}
