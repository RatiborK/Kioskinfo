// apps/api/src/posters.ts — folder-based poster catalog. The folder is the source of truth.
// Supports images and browser-friendly MP4; other video codecs require transcoding later.
import { createReadStream } from 'node:fs';
import { mkdir, readdir, lstat, open, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PosterItem {
  name: string; title: string; kind: 'image' | 'video'; mime: string;
  sizeBytes: number; updatedAt: string; url: string;
}
export interface PosterCatalog { posters: PosterItem[]; ignored: number }
export interface PosterRepository {
  list(): Promise<PosterCatalog>;
  upload(name: string, base64: string): Promise<PosterItem>;
  uploadBytes(name: string, bytes: Buffer): Promise<PosterItem>;
  remove(name: string): Promise<boolean>;
  media(name: string): Promise<{ filePath: string; mime: string; sizeBytes: number } | null>;
}
const supported: Readonly<Record<string, { mime: string; kind: 'image' | 'video' }>> = {
  '.jpg': { mime: 'image/jpeg', kind: 'image' }, '.jpeg': { mime: 'image/jpeg', kind: 'image' },
  '.png': { mime: 'image/png', kind: 'image' }, '.webp': { mime: 'image/webp', kind: 'image' },
  '.gif': { mime: 'image/gif', kind: 'image' }, '.avif': { mime: 'image/avif', kind: 'image' },
  '.bmp': { mime: 'image/bmp', kind: 'image' },
  '.mp4': { mime: 'video/mp4', kind: 'video' },
};
export const MAX_POSTER_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_VISIBLE = 300;
const safeFileName = (name: string) =>
  name.length >= 3 && name.length <= 180 && name === basename(name) &&
  !/[<>:"/\\|?*\x00-\x1f]/u.test(name) && !name.startsWith('.') && !/[. ]$/u.test(name) &&
  !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) &&
  Object.hasOwn(supported, extname(name).toLowerCase());
export function posterTitle(name: string): string {
  return basename(name, extname(name)).replace(/-[0-9a-f]{8}$/i, '').replace(/[_-]+/g, ' ').trim();
}
function signatureMatches(ext: string, bytes: Buffer): boolean {
  switch (ext) {
    case '.jpg': case '.jpeg': return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case '.png': return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    case '.webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    case '.gif': return bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a';
    case '.bmp': return bytes.toString('ascii', 0, 2) === 'BM';
    case '.avif': return bytes.toString('ascii', 4, 8) === 'ftyp' &&
      ['avif','avis'].includes(bytes.toString('ascii', 8, 12));
    case '.mp4': return bytes.toString('ascii', 4, 8) === 'ftyp';
    default: return false;
  }
}
export function defaultPostersDir(): string {
  return fileURLToPath(new URL('../../../content/posters/', import.meta.url));
}
export class FolderPosterRepository implements PosterRepository {
  readonly dir: string;
  constructor(dir = process.env.POSTERS_DIR || defaultPostersDir()) { this.dir = resolve(dir); }
  private location(name: string): string | null { return safeFileName(name) ? join(this.dir, name) : null; }
  private async inspect(name: string): Promise<PosterItem | null> {
    const path = this.location(name);
    if (!path) return null;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) return null;
      const ext = extname(name).toLowerCase();
      const handle = await open(path, 'r');
      let valid = false;
      try { const head = Buffer.alloc(16); const { bytesRead } = await handle.read(head, 0, 16, 0); valid = signatureMatches(ext, head.subarray(0, bytesRead)); }
      finally { await handle.close(); }
      if (!valid) return null;
      return { name, title: posterTitle(name), kind: supported[ext].kind, mime: supported[ext].mime,
        sizeBytes: info.size, updatedAt: info.mtime.toISOString(), url: `/api/public/posters/${encodeURIComponent(name)}/file` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async list(): Promise<PosterCatalog> {
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(this.dir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && safeFileName(e.name));
    const limited = files.slice(0, MAX_VISIBLE);
    const checked = await Promise.all(limited.map(file => this.inspect(file.name)));
    const posters = checked.filter((item): item is PosterItem => item !== null);
    posters.sort((a,b) => a.title.localeCompare(b.title,'ru'));
    return { posters, ignored: entries.length - posters.length };
  }
  async media(name: string): Promise<{ filePath: string; mime: string; sizeBytes: number } | null> {
    const item = await this.inspect(name); const path = this.location(name);
    return item && path ? { filePath: path, mime: item.mime, sizeBytes: item.sizeBytes } : null;
  }
  async upload(name: string, base64: string): Promise<PosterItem> {
    if (typeof base64 !== 'string' || !base64 ||
      base64.length > Math.ceil(MAX_POSTER_UPLOAD_BYTES / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
      throw new Error('INVALID_MEDIA');
    return this.uploadBytes(name, Buffer.from(base64,'base64'));
  }
  async uploadBytes(name: string, bytes: Buffer): Promise<PosterItem> {
    if (!safeFileName(name)) throw new Error('INVALID_FILENAME');
    const ext = extname(name).toLowerCase();
    if (ext === '.mp4') throw new Error('UPLOAD_IMAGE_ONLY');
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 ||
      bytes.length > MAX_POSTER_UPLOAD_BYTES ||
      !signatureMatches(ext,bytes.subarray(0,32))) throw new Error('INVALID_MEDIA');
    await mkdir(this.dir, { recursive: true });
    const stem = basename(name, ext).slice(0, 100);
    const finalName = `${stem}-${randomUUID().slice(0,8)}${ext}`;
    const destination = this.location(finalName);
    if (!destination) throw new Error('INVALID_FILENAME');
    const staging = join(this.dir, `.upload-${randomUUID()}.tmp`);
    try {
      await writeFile(staging, bytes, { flag: 'wx', mode: 0o600 });
      await rename(staging, destination);
    } catch (error) {
      await unlink(staging).catch(() => {});
      throw error;
    }
    const item = await this.inspect(finalName);
    if (!item) throw new Error('INVALID_MEDIA');
    return item;
  }
  async remove(name: string): Promise<boolean> {
    const file = await this.media(name); if (!file) return false;
    await unlink(file.filePath);
    return true;
  }
}
export function posterFileStream(path: string) { return createReadStream(path); }
