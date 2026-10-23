import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { createWatermarkedArchive } from '../src/utils/watermarkedArchive.js';

test('creates a signed, source-level watermark without moving a Node shebang', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codemarket-watermark-test-'));
  const sourcePath = path.join(directory, 'source.zip');
  const outputPath = path.join(directory, 'watermarked.zip');
  const signingSecret = 'local-watermark-test-key';
  const purchaseId = 'purchase-local-test-123';
  const buyerEmail = 'student@example.invalid';
  const source = '#!/usr/bin/env node\nconsole.log("local fixture");\n';
  const sourceArchive = new yazl.ZipFile();

  try {
    sourceArchive.addBuffer(Buffer.from(source), 'src/index.js');
    sourceArchive.end();
    await pipeline(sourceArchive.outputStream, createWriteStream(sourcePath));

    await createWatermarkedArchive(sourcePath, outputPath, {
      id: 'buyer-local-test',
      purchaseId,
      activationCode: 'activation-local-test',
      buyerEmail,
      issuedAt: new Date('2026-01-01T00:00:00.000Z'),
    }, signingSecret);

    const archive = await yauzl.openPromise(outputPath, { lazyEntries: true, autoClose: false });
    try {
      const entries = [];
      for await (const entry of archive.eachEntry()) {
        const stream = await archive.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        entries.push({ name: entry.fileName, contents: Buffer.concat(chunks).toString('utf8') });
      }
      const sourceEntry = entries.find((entry) => entry.name === 'src/index.js');
      assert.ok(sourceEntry, 'the source entry remains in the delivered archive');
      assert.ok(entries.some((entry) => entry.name === '.codemarket/license-activation-local-test.txt'));

      const watermarkLine = sourceEntry.contents.split('\n').find((line) => line.includes('CodeMarket license v1'));
      assert.ok(watermarkLine, 'the source contains its license comment');
      assert.ok(sourceEntry.contents.startsWith(`#!/usr/bin/env node\n${watermarkLine}\n`), 'the shebang remains the first line');

      const encodedPayload = watermarkLine.match(/CodeMarket license v1 ([A-Za-z0-9_-]+)\.([a-f0-9]{64})/)?.[1];
      const actualSignature = watermarkLine.match(/CodeMarket license v1 [A-Za-z0-9_-]+\.([a-f0-9]{64})/)?.[1];
      assert.ok(encodedPayload && actualSignature, 'the marker has a payload and HMAC');
      const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      assert.deepEqual(JSON.parse(payload), { purchaseId, buyerEmail });
      assert.equal(actualSignature, createHmac('sha256', signingSecret).update(payload).digest('hex'));
    } finally {
      archive.close();
    }
  } finally {
    try {
      await fs.rm(directory, { recursive: true, force: true });
    } catch (error) {
      console.error('Unable to clean the watermark test fixture directory.', error);
      throw error;
    }
  }
});
