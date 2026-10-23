import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

export type ProjectAnalysis = {
  archiveFingerprint: string;
  archiveFileCount: number;
  sourceFileCount: number;
  linesOfCode: number;
  dependencyCount: number;
  languages: string[];
  readme: string;
  reviewFlags: string[];
};

const SOURCE_EXTENSIONS: Record<string, string> = {
  '.c': 'C',
  '.cpp': 'C++',
  '.cs': 'C#',
  '.css': 'CSS',
  '.go': 'Go',
  '.html': 'HTML',
  '.java': 'Java',
  '.js': 'JavaScript',
  '.jsx': 'React',
  '.kt': 'Kotlin',
  '.php': 'PHP',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.sql': 'SQL',
  '.swift': 'Swift',
  '.ts': 'TypeScript',
  '.tsx': 'React',
  '.vue': 'Vue',
};
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndRecord(archive: Buffer) {
  const start = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= start; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('The uploaded ZIP archive has no valid end record.');
}

function readEntry(archive: Buffer, offset: number, compressedSize: number, uncompressedSize: number, method: number) {
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('The uploaded ZIP archive contains an invalid file header.');
  }
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  if (dataOffset + compressedSize > archive.length) {
    throw new Error('The uploaded ZIP archive contains a truncated file.');
  }
  const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed, { maxOutputLength: Math.max(uncompressedSize, 1) });
  throw new Error(`The uploaded ZIP uses unsupported compression method ${method}.`);
}

export async function analyzeProjectArchive(filePath: string): Promise<ProjectAnalysis> {
  const archive = await fs.readFile(filePath);
  const archiveFingerprint = createHash('sha256').update(archive).digest('hex');
  const endRecord = findEndRecord(archive);
  const disk = archive.readUInt16LE(endRecord + 4);
  const directoryDisk = archive.readUInt16LE(endRecord + 6);
  const entriesOnDisk = archive.readUInt16LE(endRecord + 8);
  const entryCount = archive.readUInt16LE(endRecord + 10);
  const directorySize = archive.readUInt32LE(endRecord + 12);
  const directoryOffset = archive.readUInt32LE(endRecord + 16);
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount || entryCount === 0xffff ||
      directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw new Error('Multi-disk and ZIP64 archives are not supported for review.');
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES || directoryOffset + directorySize > endRecord) {
    throw new Error('The uploaded ZIP archive exceeds safe review limits.');
  }

  let offset = directoryOffset;
  let expandedBytes = 0;
  let linesOfCode = 0;
  let sourceFileCount = 0;
  let dependencyCount = 0;
  let readme = '';
  const paths = new Set<string>();
  const languages = new Set<string>();
  const reviewFlags = new Set<string>();

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryOffset + directorySize || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('The uploaded ZIP archive has a malformed directory.');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > directoryOffset + directorySize || localOffset === 0xffffffff ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('The uploaded ZIP archive contains an unsupported or malformed entry.');
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw new Error('Encrypted ZIP entries cannot be reviewed.');
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`The ZIP archive uses unsupported compression method ${method}.`);
    }
    const rawName = archive.subarray(offset + 46, offset + 46 + nameLength);
    const name = rawName.toString((flags & 0x0800) !== 0 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    const segments = name.split('/');
    if (name.endsWith('/')) segments.pop();
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || segments.some((segment) => !segment || segment === '..' || segment === '.')) {
      throw new Error('The ZIP archive contains an unsafe path.');
    }
    const normalizedPath = segments.join('/');
    if (!normalizedPath || paths.has(normalizedPath)) {
      throw new Error('The ZIP archive contains an empty or duplicate path.');
    }
    paths.add(normalizedPath);
    const isDirectory = name.endsWith('/');
    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('The expanded project source exceeds the 100 MB review limit.');
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > 1000) {
      throw new Error('The ZIP archive contains a suspiciously compressed entry.');
    }

    const extension = normalizedPath.slice(normalizedPath.lastIndexOf('/')).includes('.')
      ? normalizedPath.slice(normalizedPath.lastIndexOf('.')).toLowerCase()
      : '';
    const isSource = !isDirectory && Boolean(SOURCE_EXTENSIONS[extension]);
    const isManifest = !isDirectory && ['package.json', 'requirements.txt', 'pom.xml', 'go.mod', 'composer.json', 'Cargo.toml'].includes(segments.at(-1)!.toLowerCase());
    const isReadme = !isDirectory && /^readme(?:\.[^.]+)?$/i.test(segments.at(-1)!);
    if ((isSource || isManifest || isReadme) && uncompressedSize <= MAX_TEXT_FILE_BYTES) {
      const contents = readEntry(archive, localOffset, compressedSize, uncompressedSize, method);
      if (contents.length !== uncompressedSize || crc32(contents) !== expectedCrc) {
        throw new Error(`The ZIP archive entry "${normalizedPath}" failed its integrity check.`);
      }
      const text = contents.toString('utf8');
      if (isSource) {
        sourceFileCount += 1;
        languages.add(SOURCE_EXTENSIONS[extension]);
        linesOfCode += text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0).length;
        if (/\beval\s*\(|\bexec\s*\(|child_process|Runtime\.getRuntime\s*\(/i.test(text)) {
          reviewFlags.add('Review dynamic execution or shell-command usage in source files.');
        }
        if (/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{12,})/i.test(text)) {
          reviewFlags.add('Review a possible hard-coded secret in a source file.');
        }
      }
      if (isManifest) {
        try {
          const manifest = JSON.parse(text) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
          dependencyCount += Object.keys(manifest.dependencies ?? {}).length + Object.keys(manifest.devDependencies ?? {}).length;
        } catch {
          if (segments.at(-1)!.toLowerCase() === 'requirements.txt') {
            dependencyCount += text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).length;
          } else {
            reviewFlags.add(`Review the dependency manifest at ${normalizedPath}.`);
          }
        }
      }
      if (isReadme && !readme) readme = text.slice(0, 12_000);
    }
    offset = entryEnd;
  }

  if (!readme) reviewFlags.add('Add a README with installation and project usage instructions.');
  if (sourceFileCount === 0) reviewFlags.add('No recognized source files were found in the archive.');
  return {
    archiveFingerprint,
    archiveFileCount: entryCount,
    sourceFileCount,
    linesOfCode,
    dependencyCount,
    languages: [...languages].sort(),
    readme,
    reviewFlags: [...reviewFlags],
  };
}

export function suggestRetailPrice(analysis: ProjectAnalysis) {
  return Math.max(500, Math.min(100_000, 500 + analysis.linesOfCode * 2 + analysis.dependencyCount * 75 + analysis.sourceFileCount * 25));
}
