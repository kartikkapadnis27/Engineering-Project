import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const uploadsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export function ensureUploadDirectory(area: 'public' | 'private') {
  const directory = path.join(uploadsRoot, area);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function buildProjectFileName(originalName: string) {
  const safeName = path.basename(originalName.replace(/\\/g, '/')).replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${Date.now()}-${randomUUID()}-${safeName}`;
}

export function publicUploadUrl(fileName: string) {
  return `/uploads/public/${encodeURIComponent(fileName)}`;
}
