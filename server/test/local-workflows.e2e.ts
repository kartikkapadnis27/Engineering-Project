import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import yauzl from 'yauzl';
import yazl from 'yazl';
import '../src/config/environment.js';
import { prisma } from '../src/lib/prisma.js';

const baseUrl = (process.env.CODEMARKET_TEST_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const ownerEmail = process.env.CODEMARKET_OWNER_EMAIL;
const ownerPassword = process.env.CODEMARKET_OWNER_PASSWORD;

type ApiResult<T> = { ok: boolean; data?: T; token?: string; user?: { id: string; role: string }; message?: string };

async function jsonRequest<T>(route: string, token?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const result = await response.json() as ApiResult<T>;
  assert.ok(response.ok && result.ok, `${init.method ?? 'GET'} ${route}: ${result.message ?? response.status}`);
  return result;
}

async function readWatermarkFromArchive(archivePath: string) {
  const archive = await yauzl.openPromise(archivePath, { lazyEntries: true, autoClose: false });
  try {
    for await (const entry of archive.eachEntry()) {
      if (entry.fileName.endsWith('/')) continue;
      const stream = await archive.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const content = Buffer.concat(chunks).toString('utf8');
      if (content.includes('CodeMarket license v1')) return content;
    }
    return null;
  } finally {
    archive.close();
  }
}

test('admin login, institutional entitlement, download, and signed source watermark work against local SQLite', async (context) => {
  await prisma.$connect();
  let buyerId: string | undefined;
  let temporaryAdminId: string | undefined;
  let sellerId: string | undefined;
  let categoryId: string | undefined;
  let projectId: string | undefined;
  let licenseId: string | undefined;
  let orderId: string | undefined;
  let purchaseId: string | undefined;
  let paymentId: string | undefined;
  let paymentScreenshotPath: string | undefined;
  let tempDirectory: string | undefined;

  context.after(async () => {
    try {
      if (purchaseId) await prisma.download.deleteMany({ where: { purchaseId } });
      if (purchaseId) await prisma.purchase.deleteMany({ where: { id: purchaseId } });
      if (orderId) await prisma.payment.deleteMany({ where: { orderId } });
      if (orderId) await prisma.orderItem.deleteMany({ where: { orderId } });
      if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
      if (licenseId) await prisma.institutionMembership.deleteMany({ where: { licenseId } });
      if (buyerId) await prisma.notification.deleteMany({ where: { userId: buyerId } });
      if (projectId) await prisma.projectFile.deleteMany({ where: { projectId } });
      if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
      if (sellerId) await prisma.sellerProfile.deleteMany({ where: { userId: sellerId } });
      if (buyerId) await prisma.buyerProfile.deleteMany({ where: { userId: buyerId } });
      if (licenseId) await prisma.institutionLicense.deleteMany({ where: { id: licenseId } });
      if (buyerId) await prisma.user.deleteMany({ where: { id: buyerId } });
      if (sellerId) await prisma.user.deleteMany({ where: { id: sellerId } });
      if (temporaryAdminId) await prisma.user.deleteMany({ where: { id: temporaryAdminId } });
      if (categoryId) await prisma.projectCategory.deleteMany({ where: { id: categoryId } });
      if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
      if (paymentScreenshotPath) {
        try {
          await fs.unlink(paymentScreenshotPath);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }

      const remainingCounts = await Promise.all([
        ...(buyerId ? [prisma.user.count({ where: { id: buyerId } })] : []),
        ...(temporaryAdminId ? [prisma.user.count({ where: { id: temporaryAdminId } })] : []),
        ...(sellerId ? [prisma.user.count({ where: { id: sellerId } })] : []),
        ...(categoryId ? [prisma.projectCategory.count({ where: { id: categoryId } })] : []),
        ...(projectId ? [prisma.project.count({ where: { id: projectId } })] : []),
        ...(projectId ? [prisma.projectFile.count({ where: { projectId } })] : []),
        ...(licenseId ? [prisma.institutionLicense.count({ where: { id: licenseId } })] : []),
        ...(orderId ? [prisma.order.count({ where: { id: orderId } })] : []),
        ...(purchaseId ? [prisma.purchase.count({ where: { id: purchaseId } })] : []),
        ...(paymentId ? [prisma.payment.count({ where: { id: paymentId } })] : []),
      ]);
      assert.ok(remainingCounts.every((count) => count === 0), 'all temporary SQLite records are removed');
      if (tempDirectory) {
        try {
          await fs.access(tempDirectory);
          assert.fail('temporary workflow files should be removed');
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }
    } catch (error) {
      console.error('Unable to clean local institutional workflow fixtures.', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  });

  assert.equal(Boolean(ownerEmail), Boolean(ownerPassword), 'provide both owner credentials or neither');
  let loginEmail = ownerEmail;
  let loginPassword = ownerPassword;
  if (!loginEmail || !loginPassword) {
    loginEmail = `codemarket-admin-e2e-${randomUUID()}@example.invalid`;
    loginPassword = randomBytes(32).toString('base64url');
    const admin = await prisma.user.create({
      data: {
        name: 'CodeMarket Local QA Admin',
        email: loginEmail,
        passwordHash: await bcrypt.hash(loginPassword, 4),
        role: 'ADMIN',
      },
      select: { id: true },
    });
    temporaryAdminId = admin.id;
  }

  const ownerResponse = await jsonRequest<{ token: string; user: { id: string; role: string } }>('/api/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail, password: loginPassword }),
  });
  const ownerToken = ownerResponse.token;
  assert.ok(ownerToken, 'owner authentication returns a bearer token');
  assert.equal(ownerResponse.user?.role, 'ADMIN', 'the authenticated owner or temporary local admin has the license-management role');

  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codemarket-institution-e2e-'));
  const sourcePath = path.join(tempDirectory, 'local-project-fixture.zip');
  const sourceArchive = new yazl.ZipFile();
  sourceArchive.addBuffer(Buffer.from('#!/usr/bin/env node\nconsole.log("local fixture");\n'), 'src/index.js');
  sourceArchive.end();
  await pipeline(sourceArchive.outputStream, createWriteStream(sourcePath));

  const category = await prisma.projectCategory.create({
    data: { name: `CodeMarket QA ${randomUUID()}`, slug: `codemarket-qa-${randomUUID()}` },
  });
  categoryId = category.id;
  const seller = await prisma.user.create({
    data: {
      name: 'CodeMarket Local QA Seller',
      email: `codemarket-seller-e2e-${randomUUID()}@example.invalid`,
      passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 4),
      role: 'SELLER',
      sellerProfile: { create: { skills: '[]' } },
    },
    select: { id: true, sellerProfile: { select: { id: true } } },
  });
  sellerId = seller.id;
  assert.ok(seller.sellerProfile, 'temporary seller profile is created with the seller test account');
  const project = await prisma.project.create({
    data: {
      title: 'CodeMarket Local QA Fixture',
      slug: `codemarket-qa-project-${randomUUID()}`,
      shortDescription: 'Temporary source archive for local end-to-end verification.',
      fullDescription: 'A temporary project fixture created and removed by the local authenticated workflow test.',
      categoryId: category.id,
      sellerId: seller.sellerProfile.id,
      status: 'APPROVED',
      projectStatus: 'Approved',
      price: 100,
      studentRetailPrice: 100,
      tags: '[]',
    },
    select: { id: true },
  });
  projectId = project.id;
  await prisma.projectFile.create({
    data: {
      projectId: project.id,
      fileName: 'local-project-fixture.zip',
      storageKey: sourcePath,
      mimeType: 'application/zip',
      size: (await fs.stat(sourcePath)).size,
    },
  });
  const fixtureProject = { id: project.id, category: { name: category.name } };

  const buyerEmail = `codemarket-e2e-${randomUUID()}@example.invalid`;
  const buyerPassword = randomBytes(24).toString('base64url');
  const buyerResponse = await jsonRequest<{ id: string; role: string }>('/api/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ name: 'CodeMarket Local QA', email: buyerEmail, password: buyerPassword, role: 'BUYER' }),
  });
  buyerId = buyerResponse.user?.id;
  assert.ok(buyerId, 'temporary buyer is created for buyer-only entitlement checks');
  assert.equal(buyerResponse.user?.role, 'BUYER');
  const buyerToken = buyerResponse.token;
  assert.ok(buyerToken, 'buyer registration returns a bearer token');

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const licenseResponse = await jsonRequest<{ id: string; code: string }>('/api/institutions/admin', ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      institutionName: 'CodeMarket Local QA Fixture',
      categories: [fixtureProject.category.name],
      maxSeats: 1,
      annualPrice: 100,
      paymentReference: `QA-${randomUUID()}`,
      expiresAt,
    }),
  });
  licenseId = licenseResponse.data?.id;
  const licenseCode = licenseResponse.data?.code;
  assert.ok(licenseId && licenseCode, 'owner creates a temporary SQLite license for the fixture');

  await jsonRequest('/api/institutions/redeem', buyerToken, {
    method: 'POST',
    body: JSON.stringify({ code: licenseCode }),
  });
  const accessResponse = await jsonRequest<{ downloadLink: string; institutionName: string }>(
    `/api/projects/${encodeURIComponent(project.id)}/institution-access`,
    buyerToken,
  );
  assert.equal(accessResponse.data?.institutionName, 'CodeMarket Local QA Fixture');
  assert.ok(accessResponse.data?.downloadLink, 'an active category-matching membership issues a download link');

  const downloadUrl = new URL(accessResponse.data!.downloadLink, baseUrl);
  const downloadResponse = await fetch(downloadUrl);
  assert.equal(downloadResponse.status, 200, 'the issued institutional download token is accepted');
  const archiveBytes = Buffer.from(await downloadResponse.arrayBuffer());
  assert.ok(archiveBytes.length > 0, 'the endpoint returns a non-empty project ZIP');

  const archivePath = path.join(tempDirectory, 'institution-download.zip');
  await fs.writeFile(archivePath, archiveBytes);
  const watermarkedSource = await readWatermarkFromArchive(archivePath);
  assert.ok(watermarkedSource, 'downloaded source contains a native CodeMarket watermark');
  const marker = watermarkedSource.match(/CodeMarket license v1 ([A-Za-z0-9_-]+)\.([a-f0-9]{64})/);
  assert.ok(marker, 'watermark is signed and carries an encoded identity');
  const payload = Buffer.from(marker[1], 'base64url').toString('utf8');
  assert.deepEqual(JSON.parse(payload), { purchaseId: (await prisma.institutionMembership.findFirstOrThrow({
    where: { licenseId, userId: buyerId },
    select: { id: true },
  })).id, buyerEmail });
  const signingSecret = process.env.CODEMARKET_WATERMARK_SECRET ?? process.env.JWT_SECRET ?? 'development-secret';
  assert.equal(marker[2], createHmac('sha256', signingSecret).update(payload).digest('hex'));

  const membership = await prisma.institutionMembership.findFirstOrThrow({
    where: { licenseId, userId: buyerId },
    select: { id: true },
  });
  assert.deepEqual(JSON.parse(payload), { purchaseId: membership.id, buyerEmail });

  const paymentProof = new FormData();
  paymentProof.set('projectId', project.id);
  paymentProof.set('utrNumber', `QA${randomBytes(12).toString('hex')}`);
  paymentProof.set(
    'paymentScreenshot',
    new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }),
    'payment-proof.png',
  );
  const submittedResponse = await fetch(`${baseUrl}/api/payments/manual/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: paymentProof,
  });
  const submitted = await submittedResponse.json() as ApiResult<{ orderId: string; paymentId: string; paymentVerificationState: string }>;
  assert.equal(submittedResponse.status, 201, `manual UPI submission: ${submitted.message ?? submittedResponse.status}`);
  assert.equal(submitted.data?.paymentVerificationState, 'PENDING');
  orderId = submitted.data?.orderId;
  paymentId = submitted.data?.paymentId;
  assert.ok(orderId && paymentId, 'payment proof submission creates a pending payment and order');

  const pendingLedger = await jsonRequest<Array<{ id: string; paymentVerificationState: string; screenshotAvailable: boolean }>>('/api/admin/payments', ownerToken);
  const ledgerPayment = pendingLedger.data?.find((payment) => payment.id === paymentId);
  assert.equal(ledgerPayment?.paymentVerificationState, 'PENDING', 'owner ledger shows the submitted payment for review');
  assert.equal(ledgerPayment?.screenshotAvailable, true, 'owner ledger exposes payment-proof availability');
  const screenshotResponse = await fetch(`${baseUrl}/api/admin/payments/${encodeURIComponent(paymentId)}/screenshot`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(screenshotResponse.status, 200, 'owner can view the private payment screenshot');
  assert.ok((await screenshotResponse.arrayBuffer()).byteLength > 0);
  const paymentRecord = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { paymentScreenshotUrl: true } });
  paymentScreenshotPath = paymentRecord.paymentScreenshotUrl ?? undefined;
  assert.ok(paymentScreenshotPath, 'payment screenshot is stored in private local storage');

  const pendingStatus = await jsonRequest<{ paymentVerificationState: string }>(
    `/api/payments/manual/${encodeURIComponent(paymentId)}/status`,
    buyerToken,
  );
  assert.equal(pendingStatus.data?.paymentVerificationState, 'PENDING', 'buyer sees payment awaiting manual review');

  await jsonRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}/verify`, ownerToken, {
    method: 'PATCH',
    body: JSON.stringify({ decision: 'CONFIRMED', reviewNote: 'Local integration-test verification.' }),
  });
  const confirmedPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { paymentVerificationState: true, escrowLockStatus: true, verifiedAt: true, escrowReleaseAt: true },
  });
  assert.equal(confirmedPayment.paymentVerificationState, 'CONFIRMED');
  assert.equal(confirmedPayment.escrowLockStatus, 'LOCKED');
  assert.ok(confirmedPayment.verifiedAt && confirmedPayment.escrowReleaseAt, 'manual verification starts the escrow window');

  const paymentStatus = await jsonRequest<{
    paymentVerificationState: string;
    downloadLink?: string;
    activationCode?: string;
  }>(`/api/payments/manual/${encodeURIComponent(paymentId)}/status`, buyerToken);
  assert.equal(paymentStatus.data?.paymentVerificationState, 'CONFIRMED');
  assert.ok(paymentStatus.data?.downloadLink, 'a confirmed payment issues a purchase-scoped download link');
  assert.ok(paymentStatus.data?.activationCode, 'verified purchase includes an activation reference');

  const paidDownloadUrl = new URL(paymentStatus.data!.downloadLink!, baseUrl);
  const paidDownloadResponse = await fetch(paidDownloadUrl);
  assert.equal(paidDownloadResponse.status, 200, 'the confirmed purchase token authorizes archive delivery');
  const paidArchiveBytes = Buffer.from(await paidDownloadResponse.arrayBuffer());
  assert.ok(paidArchiveBytes.length > 0, 'the confirmed purchase returns a non-empty source archive');
  const paidArchivePath = path.join(tempDirectory, 'paid-project-download.zip');
  await fs.writeFile(paidArchivePath, paidArchiveBytes);
  const paidWatermarkedSource = await readWatermarkFromArchive(paidArchivePath);
  assert.ok(paidWatermarkedSource, 'post-payment source contains a native CodeMarket watermark');
  const paidMarker = paidWatermarkedSource.match(/CodeMarket license v1 ([A-Za-z0-9_-]+)\.([a-f0-9]{64})/);
  assert.ok(paidMarker, 'post-payment watermark carries a signed identity');
  const paidPayload = Buffer.from(paidMarker[1], 'base64url').toString('utf8');
  const purchase = await prisma.purchase.findFirstOrThrow({ where: { orderId, buyerId }, select: { id: true } });
  purchaseId = purchase.id;
  assert.deepEqual(JSON.parse(paidPayload), { purchaseId, buyerEmail });
  assert.equal(paidMarker[2], createHmac('sha256', signingSecret).update(paidPayload).digest('hex'));
});
