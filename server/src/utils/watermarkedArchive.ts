import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';

const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
const COMMENT_STYLES: Record<string, string> = {
  '.c': 'block', '.cc': 'block', '.cpp': 'block', '.cs': 'block', '.css': 'block',
  '.go': 'block', '.h': 'block', '.hpp': 'block', '.java': 'block', '.js': 'block',
  '.jsx': 'block', '.kt': 'block', '.php': 'block', '.py': 'hash', '.rb': 'hash',
  '.rs': 'block', '.scala': 'block', '.sh': 'hash', '.sql': 'dash', '.swift': 'block',
  '.ts': 'block', '.tsx': 'block', '.vue': 'html', '.html': 'html', '.xml': 'html',
  '.yaml': 'hash', '.yml': 'hash',
};

function safeArchivePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (normalized.endsWith('/')) segments.pop();
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) ||
      segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Error('The purchased archive contains an unsafe file path and cannot be delivered.');
  }
  return normalized;
}

function addSourceWatermark(
  fileName: string,
  contents: Buffer,
  purchaseId: string,
  buyerEmail: string,
  signingSecret: string,
) {
  if (contents.length > MAX_SOURCE_FILE_BYTES || contents.includes(0)) return contents;
  const text = contents.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(contents)) return contents;
  const extension = path.extname(fileName).toLowerCase();
  const style = COMMENT_STYLES[extension];
  if (!style) return contents;
  const identity = JSON.stringify({ purchaseId, buyerEmail: buyerEmail.replace(/[\r\n]/g, '') });
  const encodedIdentity = Buffer.from(identity, 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(identity).digest('hex');
  const watermark = `CodeMarket license v1 ${encodedIdentity}.${signature}`;
  const comment = style === 'hash' ? `# ${watermark}` : style === 'dash' ? `-- ${watermark}` :
    style === 'html' ? `<!-- ${watermark} -->` : `/* ${watermark} */`;
  const hasBom = text.startsWith('\uFEFF');
  const source = hasBom ? text.slice(1) : text;
  const lines = source.split(/(?<=\n)/);
  let insertionIndex = 0;
  if (lines[0]?.startsWith('#!')) insertionIndex = 1;
  const prologueLine = lines[insertionIndex];
  if (prologueLine && (/coding[:=]\s*[-\w.]+/.test(prologueLine) ||
      /^\s*<\?xml\b.*\?>\s*(?:\r?\n)?$/i.test(prologueLine) ||
      /^\s*@charset\s+["'][^"']+["'];\s*(?:\r?\n)?$/i.test(prologueLine))) {
    insertionIndex += 1;
  }
  lines.splice(insertionIndex, 0, `${comment}\n`);
  return Buffer.from(`${hasBom ? '\uFEFF' : ''}${lines.join('')}`, 'utf8');
}

async function readEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry) {
  const stream = await zipFile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > entry.uncompressedSize || size > MAX_EXPANDED_BYTES) {
      throw new Error(`Archive entry "${entry.fileName}" exceeded its declared size.`);
    }
    chunks.push(chunk);
  }
  if (size !== entry.uncompressedSize) {
    throw new Error(`Archive entry "${entry.fileName}" did not match its declared size.`);
  }
  return Buffer.concat(chunks, size);
}

export async function createWatermarkedArchive(
  sourcePath: string,
  outputPath: string,
  purchase: { id: string; purchaseId: string; activationCode: string; buyerEmail: string; issuedAt: Date },
  signingSecret = process.env.CODEMARKET_WATERMARK_SECRET ?? process.env.JWT_SECRET ?? 'development-secret',
) {
  const archive = await yauzl.openPromise(sourcePath, {
    lazyEntries: true,
    autoClose: false,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  const output = new yazl.ZipFile();
  let expandedBytes = 0;
  let entryCount = 0;
  const entryPaths = new Set<string>();
  const writePromise = pipeline(output.outputStream, createWriteStream(outputPath, { flags: 'wx' }));
  try {
    for await (const entry of archive.eachEntry()) {
      entryCount += 1;
      if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error('The purchased archive contains too many files for safe delivery.');
      const fileName = safeArchivePath(entry.fileName);
      if (entryPaths.has(fileName)) throw new Error('The purchased archive contains duplicate file paths and cannot be delivered.');
      entryPaths.add(fileName);
      if (entry.isEncrypted() || !entry.canDecodeFileData()) {
        throw new Error(`Archive entry "${fileName}" uses unsupported encryption or compression.`);
      }
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (unixType === 0xa000) throw new Error('Symbolic links are not allowed in delivered project archives.');
      expandedBytes += entry.uncompressedSize;
      if (expandedBytes > MAX_EXPANDED_BYTES ||
          (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 1000)) {
        throw new Error('The purchased archive exceeds safe expansion limits.');
      }
      if (fileName.endsWith('/')) {
        output.addEmptyDirectory(fileName, { mtime: entry.getLastModDate() });
        continue;
      }
      const content = await readEntry(archive, entry);
      output.addBuffer(
        addSourceWatermark(fileName, content, purchase.purchaseId, purchase.buyerEmail, signingSecret),
        fileName,
        { compress: true, compressionLevel: 6, mtime: entry.getLastModDate() },
      );
    }
    output.addBuffer(
      Buffer.from([
        'CodeMarket purchase license',
        `Purchase reference: ${purchase.activationCode}`,
        `Licensed buyer: ${purchase.buyerEmail}`,
        `Issued: ${purchase.issuedAt.toISOString()}`,
        'This purchase is for the named buyer only. The hidden source comments and this file identify this purchase.',
        '',
      ].join('\n'), 'utf8'),
      `.codemarket/license-${purchase.activationCode}.txt`,
      { compress: true },
    );
    output.end();
    await writePromise;
  } catch (error) {
    archive.close();
    output.end();
    await writePromise.catch(() => undefined);
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      if (cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code !== 'ENOENT') {
        console.error('Unable to remove an incomplete watermarked archive.', cleanupError);
      }
    }
    throw error;
  } finally {
    archive.close();
  }
}
