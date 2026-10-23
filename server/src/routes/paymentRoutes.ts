import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import { buildProjectFileName, ensureUploadDirectory } from '../utils/fileStorage.js';

export const paymentRoutes = Router();

const couponSchema = z.object({
  projectId: z.string().trim().min(1),
  code: z.string().trim().min(1).max(40),
});

const manualPaymentSchema = z.object({
  projectId: z.string().trim().min(1),
  projectVersionId: z.string().trim().min(1).optional(),
  utrNumber: z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9-]+$/),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

const screenshotUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, ensureUploadDirectory('private')),
    filename: (_req, file, callback) => callback(null, buildProjectFileName(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const validImageTypes: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    };
    if (!validImageTypes[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) {
      callback(new Error('Payment screenshot must be a JPG, PNG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
});

const uploadPaymentScreenshot: RequestHandler = (req, res, next) => {
  screenshotUpload.single('paymentScreenshot')(req, res, async (error: unknown) => {
    if (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to upload payment screenshot.' });
    }
    if (req.file) {
      let validImage = false;
      try {
        const file = await fs.open(req.file.path, 'r');
        try {
          const header = Buffer.alloc(12);
          const { bytesRead } = await file.read(header, 0, header.length, 0);
          const isPng = bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          const isJpeg = bytesRead >= 3 && header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
          const isWebp = bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
          validImage = isPng || isJpeg || isWebp;
        } finally {
          await file.close();
        }
      } catch (validationError) {
        next(validationError);
        return;
      }
      if (!validImage) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          next(cleanupError);
          return;
        }
        return res.status(400).json({ ok: false, message: 'The uploaded file is not a supported image.' });
      }
    }
    next();
  });
};

async function removePaymentScreenshot(filePath: string) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true;
    console.error('Unable to remove an uncommitted payment screenshot.', error);
    return false;
  }
}

async function calculateCouponTotal(projectPrice: number, couponCode?: string) {
  if (!couponCode) {
    return { total: projectPrice, discount: 0, code: null };
  }

  const code = couponCode.toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt <= new Date())) {
    throw new Error('This coupon code is invalid or expired.');
  }

  const discount = coupon.discountPercent
    ? Math.round(projectPrice * coupon.discountPercent / 100)
    : Math.min(projectPrice, (coupon.discountAmount ?? 0) * 100);
  return {
    total: Math.max(100, projectPrice - discount),
    discount: projectPrice - Math.max(100, projectPrice - discount),
    code: coupon.code,
  };
}

paymentRoutes.get('/manual/owner-qr', async (_req, res) => {
  try {
    const settings = await prisma.marketplaceSettings.findUnique({ where: { id: 'owner' } });
    return res.json({
      ok: true,
      data: {
        ownerUpiQrUrl: settings?.ownerUpiQrUrl ?? null,
        ownerUpiId: settings?.ownerUpiId ?? null,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load marketplace payment details.' });
  }
});

paymentRoutes.post('/manual/submit', authenticateJWT, requireRole(['BUYER']), uploadPaymentScreenshot, async (req, res) => {
  const parsed = manualPaymentSchema.safeParse(req.body);
  if (!parsed.success || !req.file) {
    if (req.file && !(await removePaymentScreenshot(req.file.path))) {
      return res.status(500).json({ ok: false, message: 'Unable to clean up the invalid payment screenshot.' });
    }
    return res.status(400).json({
      ok: false,
      message: 'Provide a valid UTR and upload a payment screenshot.',
      ...(!parsed.success ? { errors: parsed.error.flatten() } : {}),
    });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, status: 'APPROVED' },
      select: { id: true, price: true, studentRetailPrice: true },
    });
    if (!project) {
      if (!(await removePaymentScreenshot(req.file.path))) {
        return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
      }
      return res.status(404).json({ ok: false, message: 'Project not found or not approved.' });
    }
    let projectVersionId: string | null = null;
    let listedPrice = project.studentRetailPrice ?? project.price;
    if (parsed.data.projectVersionId) {
      const version = await prisma.projectVersion.findFirst({
        where: { id: parsed.data.projectVersionId, projectId: project.id, status: 'APPROVED' },
        select: { id: true, paidUpdate: true, updatePrice: true },
      });
      if (!version || !version.paidUpdate || !version.updatePrice || version.updatePrice < 100) {
        if (!(await removePaymentScreenshot(req.file.path))) {
          return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
        }
        return res.status(400).json({ ok: false, message: 'This paid project update is unavailable.' });
      }
      const basePurchase = await prisma.purchase.findFirst({
        where: { buyerId: req.user!.id, projectId: project.id, projectVersionId: null },
        select: { id: true },
      });
      if (!basePurchase) {
        if (!(await removePaymentScreenshot(req.file.path))) {
          return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
        }
        return res.status(403).json({ ok: false, message: 'Purchase the base project before purchasing a paid update.' });
      }
      const existingVersionPurchase = await prisma.purchase.findFirst({
        where: { buyerId: req.user!.id, projectId: project.id, projectVersionId: version.id },
        select: { id: true },
      });
      if (existingVersionPurchase) {
        if (!(await removePaymentScreenshot(req.file.path))) {
          return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
        }
        return res.status(409).json({ ok: false, message: 'You already own this project update.' });
      }
      projectVersionId = version.id;
      listedPrice = version.updatePrice;
    }

    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        buyerId: req.user!.id,
        projectId: project.id,
        projectVersionId: projectVersionId ?? null,
      },
      select: { id: true },
    });
    if (existingPurchase) {
      if (!(await removePaymentScreenshot(req.file.path))) {
        return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
      }
      return res.status(409).json({ ok: false, message: 'You already own this project.' });
    }

    const pendingPayment = await prisma.payment.findFirst({
      where: {
        provider: 'manual-upi',
        paymentVerificationState: 'PENDING',
        order: {
          userId: req.user!.id,
          orderItems: { some: { projectId: project.id } },
        },
      },
      select: { id: true },
    });
    if (pendingPayment) {
      if (!(await removePaymentScreenshot(req.file.path))) {
        return res.status(500).json({ ok: false, message: 'Unable to clean up the rejected payment screenshot.' });
      }
      return res.status(409).json({ ok: false, message: 'A payment for this project is already awaiting verification.' });
    }

    const { total: amount, code } = await calculateCouponTotal(listedPrice, parsed.data.couponCode);
    const order = await prisma.order.create({
      data: {
        userId: req.user!.id,
        totalAmount: amount,
        couponCode: code,
        status: 'PAYMENT_REVIEW',
        orderItems: { create: { projectId: project.id, price: amount, quantity: 1 } },
        payments: {
          create: {
            provider: 'manual-upi',
            projectVersionId,
            amount,
            currency: 'INR',
            status: 'PENDING',
            utrNumber: parsed.data.utrNumber,
            paymentScreenshotUrl: req.file!.path,
            paymentVerificationState: 'PENDING',
          },
        },
      },
      include: { payments: { select: { id: true } } },
    });
    return res.status(201).json({
      ok: true,
      message: 'Payment submitted for owner verification.',
      data: { orderId: order.id, paymentId: order.payments[0]?.id, paymentVerificationState: 'PENDING' },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      if (req.file && !(await removePaymentScreenshot(req.file.path))) {
        return res.status(500).json({ ok: false, message: 'Unable to clean up the duplicate payment screenshot.' });
      }
      return res.status(409).json({ ok: false, message: 'This UTR has already been submitted.' });
    }
    if (req.file && !(await removePaymentScreenshot(req.file.path))) {
      return res.status(500).json({ ok: false, message: 'Unable to clean up the failed payment screenshot.' });
    }
    const message = error instanceof Error ? error.message : 'Unable to submit payment for review.';
    return res.status(message.includes('coupon code') ? 400 : 500).json({ ok: false, message });
  }
});

paymentRoutes.get('/manual/:id/status', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    const paymentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!paymentId) {
      return res.status(404).json({ ok: false, message: 'Payment request not found.' });
    }
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, order: { userId: req.user!.id }, provider: 'manual-upi' },
      include: { order: { include: { orderItems: true } } },
    });
    if (!payment) {
      return res.status(404).json({ ok: false, message: 'Payment request not found.' });
    }
    const data: Record<string, string> = { paymentVerificationState: payment.paymentVerificationState };
    if (payment.paymentVerificationState === 'CONFIRMED') {
      const item = payment.order.orderItems[0];
      if (!item) {
        return res.status(409).json({ ok: false, message: 'The payment order has no project.' });
      }
      const purchase = await prisma.purchase.findFirst({
        where: { orderId: payment.orderId, buyerId: req.user!.id, projectId: item.projectId },
      });
      if (!purchase) {
        return res.status(409).json({ ok: false, message: 'Verified access has not been issued yet.' });
      }
      const token = jwt.sign(
        { projectId: item.projectId, buyerId: req.user!.id, purchaseId: purchase.id },
        process.env.JWT_SECRET ?? 'development-secret',
        { expiresIn: '1h' },
      );
      data.downloadLink = `/api/projects/download?token=${token}`;
      data.activationCode = purchase.activationCode ?? '';
    }
    return res.json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load payment status.' });
  }
});

paymentRoutes.post('/verify-coupon', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  const parsed = couponSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Provide a project and coupon code.' });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, status: 'APPROVED' },
      select: { price: true },
    });
    if (!project) {
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }
    const result = await calculateCouponTotal(project.price, parsed.data.code);
    return res.json({
      ok: true,
      data: {
        code: result.code,
        discount: result.discount / 100,
        total: result.total / 100,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify coupon.';
    return res.status(message.includes('invalid or expired') ? 400 : 500).json({ ok: false, message });
  }
});
