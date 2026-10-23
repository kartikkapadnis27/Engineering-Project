import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureUploadDirectory } from './fileStorage.js';
import { createWatermarkedArchive } from './watermarkedArchive.js';

export async function prepareWatermarkedDownload(
  file: { storageKey: string; fileName: string },
  buyer: { id: string; email: string },
  purchase: { purchaseId: string; activationCode: string; issuedAt: Date },
) {
  let directory: string;
  try {
    directory = await fs.mkdtemp(path.join(ensureUploadDirectory('private'), `delivery-${randomUUID()}-`));
  } catch (error) {
    console.error('Unable to create a temporary directory for project delivery.', error);
    throw new Error('Unable to prepare the project archive for delivery.');
  }
  const outputPath = path.join(directory, 'project.zip');
  try {
    await createWatermarkedArchive(file.storageKey, outputPath, {
      id: buyer.id,
      purchaseId: purchase.purchaseId,
      activationCode: purchase.activationCode,
      buyerEmail: buyer.email,
      issuedAt: purchase.issuedAt,
    });
    return { directory, outputPath, fileName: path.basename(file.fileName) };
  } catch (error) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Unable to remove temporary project delivery files after a failure.', cleanupError);
    }
    throw error;
  }
}

export async function cleanupProjectDelivery(directory: string) {
  try {
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) {
    console.error('Unable to remove temporary watermarked project archive.', error);
  }
}
