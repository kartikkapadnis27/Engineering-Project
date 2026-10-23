import { Router } from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import { ensureUploadDirectory } from '../utils/fileStorage.js';
import { suggestRetailPrice } from '../utils/projectAnalysis.js';

export const adminRoutes = Router();

adminRoutes.use(authenticateJWT);
adminRoutes.use(requireRole(['ADMIN']));

const projectApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).default('APPROVED'),
  reviewNote: z.string().trim().max(500).optional(),
}).refine((value) => value.status !== 'REJECTED' || Boolean(value.reviewNote?.trim()), {
  message: 'A reason is required when rejecting a project.',
  path: ['reviewNote'],
});

const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((code) => code.toUpperCase()),
  discountPercent: z.number().int().min(1).max(90).optional(),
  discountAmount: z.number().int().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
}).refine((coupon) => Boolean(coupon.discountPercent) !== Boolean(coupon.discountAmount), {
  message: 'Provide exactly one percentage or fixed-amount discount.',
});

const pricingSchema = z.object({
  developerAgreedPrice: z.number().int().min(0),
  studentRetailPrice: z.number().int().min(100),
  integrityScore: z.number().int().min(0).max(100),
  projectStatus: z.enum(['Pending', 'Approved', 'Negotiation']),
  codeMarketAssured: z.boolean().optional(),
}).refine((prices) => prices.studentRetailPrice >= prices.developerAgreedPrice, {
  message: 'Retail price cannot be lower than the agreed developer price.',
  path: ['studentRetailPrice'],
});

const moderationSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
});

const settingsSchema = z.object({
  ownerUpiQrUrl: z.string().trim().url().refine((value) => value.startsWith('https://')).or(z.literal('')).optional(),
  ownerUpiId: z.string().trim().max(120).regex(/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/).or(z.literal('')).optional(),
});

adminRoutes.get('/overview', async (_req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 13);
    const [pendingProjects, approvedProjects, negotiationProjects, pendingPayments, sellers, buyers, settledPayments, recentPayments, settings] = await Promise.all([
      prisma.project.count({ where: { status: { in: ['PENDING_APPROVAL', 'PENDING_REVIEW', 'CHANGES_REQUESTED'] } } }),
      prisma.project.count({ where: { status: 'APPROVED' } }),
      prisma.project.count({ where: { projectStatus: 'Negotiation' } }),
      prisma.payment.count({ where: { paymentVerificationState: 'PENDING' } }),
      prisma.user.count({ where: { role: 'SELLER' } }),
      prisma.user.count({ where: { role: 'BUYER' } }),
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
      prisma.payment.findMany({
        where: { createdAt: { gte: since } },
        select: { amount: true, createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.marketplaceSettings.findUnique({ where: { id: 'owner' } }),
    ]);
    const dailyActivity = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(since);
      date.setDate(since.getDate() + index);
      const day = date.toISOString().slice(0, 10);
      return {
        date: day,
        label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        volume: recentPayments
          .filter((payment) => payment.createdAt.toISOString().slice(0, 10) === day && payment.status === 'SUCCESS')
          .reduce((total, payment) => total + payment.amount, 0) / 100,
      };
    });

    res.json({
      ok: true,
      data: {
        stats: {
          pendingProjects,
          approvedProjects,
          negotiationProjects,
          pendingPayments,
          sellers,
          buyers,
          grossProcessed: (settledPayments._sum.amount ?? 0) / 100,
        },
        dailyActivity,
        settings: settings ?? { ownerUpiQrUrl: '', ownerUpiId: '' },
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load the owner dashboard.' });
  }
});

adminRoutes.get('/projects', async (_req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 100,
      include: {
        category: true,
        seller: { include: { user: true } },
      },
    });

    res.json({
      ok: true,
      data: projects.map((project: any) => {
        const analysis = project.sourceAnalysis ? JSON.parse(project.sourceAnalysis) : null;
        return {
          id: project.id,
          title: project.title,
          category: project.category.name,
          projectStatus: project.status === 'APPROVED' && project.projectStatus === 'Pending'
            ? 'Approved'
            : project.projectStatus || (project.status === 'APPROVED' ? 'Approved' : 'Pending'),
          status: project.status,
          integrityScore: project.integrityScore,
          price: Number(project.studentRetailPrice ?? project.price) / 100,
          developerAgreedPrice: project.developerAgreedPrice === null ? null : project.developerAgreedPrice / 100,
          studentRetailPrice: project.studentRetailPrice === null ? Number(project.price) / 100 : project.studentRetailPrice / 100,
          codeMarketAssured: project.codeMarketAssured,
          description: project.shortDescription,
          uploadedAt: project.uploadedAt,
          seller: project.seller.user.name,
          sellerEmail: project.seller.user.email,
          whatsappNumber: project.seller.whatsappNumber ?? project.seller.user.phone,
          developerUpiQrUrl: project.seller.developerUpiQrUrl,
          analysis: analysis ? {
            archiveFileCount: analysis.archiveFileCount,
            sourceFileCount: analysis.sourceFileCount,
            linesOfCode: analysis.linesOfCode,
            dependencyCount: analysis.dependencyCount,
            languages: analysis.languages,
            reviewFlags: analysis.reviewFlags,
            duplicateSourceCount: project.duplicateSourceCount,
            suggestedPrice: suggestRetailPrice(analysis) / 100,
          } : null,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load admin review queue.' });
  }
});

adminRoutes.patch('/projects/:id/pricing', async (req, res) => {
  const parsed = pricingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Invalid pricing update.', errors: parsed.error.flatten() });
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const current = await tx.project.findUniqueOrThrow({
        where: { id: req.params.id },
        select: { studentRetailPrice: true, price: true, title: true },
      });
      const updated = await tx.project.update({
        where: { id: req.params.id },
        data: {
          developerAgreedPrice: parsed.data.developerAgreedPrice,
          studentRetailPrice: parsed.data.studentRetailPrice,
          integrityScore: parsed.data.integrityScore,
          price: parsed.data.studentRetailPrice,
          projectStatus: parsed.data.projectStatus,
          status: parsed.data.projectStatus === 'Approved'
            ? 'APPROVED'
            : parsed.data.projectStatus === 'Negotiation'
              ? 'NEGOTIATION'
              : 'PENDING_REVIEW',
          ...(parsed.data.codeMarketAssured === undefined ? {} : { codeMarketAssured: parsed.data.codeMarketAssured }),
        },
      });
      const oldPrice = current.studentRetailPrice ?? current.price;
      if (updated.status === 'APPROVED' && parsed.data.studentRetailPrice < oldPrice) {
        const alerts = await tx.priceAlert.findMany({
          where: { projectId: updated.id },
          select: { userId: true },
        });
        if (alerts.length > 0) {
          await tx.notification.createMany({
            data: alerts.map(({ userId }) => ({
              userId,
              title: 'Project price reduced',
              message: `${current.title} is now available at a lower retail price.`,
            })),
          });
        }
      }
      return updated;
    });
    return res.json({ ok: true, data: project });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to update project pricing.' });
  }
});

adminRoutes.get('/projects/:id/analysis', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { title: true, sourceAnalysis: true, duplicateSourceCount: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
    const analysis = project.sourceAnalysis ? JSON.parse(project.sourceAnalysis) as Record<string, unknown> : null;
    return res.json({
      ok: true,
      data: {
        title: project.title,
        analysis,
        duplicateSourceCount: project.duplicateSourceCount,
        suggestedRetailPrice: analysis ? suggestRetailPrice(analysis as Parameters<typeof suggestRetailPrice>[0]) : null,
        notice: 'Structural metrics and exact archive hashes are screening signals only; they do not determine authorship or originality.',
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load the archive analysis.' });
  }
});

adminRoutes.get('/payments', async (_req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { provider: 'manual-upi' },
      include: {
        order: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            orderItems: { include: { project: { select: { id: true, title: true, seller: { include: { user: { select: { name: true, email: true } } } } } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      ok: true,
      data: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount / 100,
        utrNumber: payment.utrNumber,
        screenshotUrl: payment.paymentScreenshotUrl,
        paymentVerificationState: payment.paymentVerificationState,
        paymentReviewNote: payment.paymentReviewNote,
        escrowLockStatus: payment.escrowLockStatus,
        verifiedAt: payment.verifiedAt,
        escrowReleaseAt: payment.escrowReleaseAt,
        screenshotAvailable: Boolean(payment.paymentScreenshotUrl),
        createdAt: payment.createdAt,
        buyer: payment.order.user,
        project: payment.order.orderItems[0]?.project ? {
          id: payment.order.orderItems[0].project.id,
          title: payment.order.orderItems[0].project.title,
          seller: payment.order.orderItems[0].project.seller.user,
          developerUpiQrUrl: payment.order.orderItems[0].project.seller.developerUpiQrUrl,
        } : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load payment verification requests.' });
  }
});

adminRoutes.get('/payments/:id/screenshot', async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      select: { paymentScreenshotUrl: true },
    });
    const screenshotPath = payment?.paymentScreenshotUrl;
    if (!screenshotPath || path.dirname(path.resolve(screenshotPath)) !== path.resolve(ensureUploadDirectory('private'))) {
      return res.status(404).json({ ok: false, message: 'Payment screenshot not found.' });
    }
    return res.sendFile(path.basename(screenshotPath), { root: ensureUploadDirectory('private') });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load payment screenshot.' });
  }
});

adminRoutes.patch('/payments/:id/verify', async (req, res) => {
  const parsed = z.object({
    decision: z.enum(['CONFIRMED', 'REJECTED']),
    reviewNote: z.string().trim().max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Choose whether to confirm or reject this payment.' });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id },
        include: { order: { include: { orderItems: true } } },
      });
      if (!payment || payment.provider !== 'manual-upi') {
        throw new Error('Manual payment request not found.');
      }
      if (payment.paymentVerificationState !== 'PENDING') {
        throw new Error('This payment request has already been reviewed.');
      }
      const firstItem = payment.order.orderItems[0];
      if (!firstItem) {
        throw new Error('The payment order has no project.');
      }

      if (parsed.data.decision === 'REJECTED') {
        const claim = await tx.payment.updateMany({
          where: { id: payment.id, paymentVerificationState: 'PENDING' },
          data: {
            paymentVerificationState: 'REJECTED',
            paymentReviewNote: parsed.data.reviewNote ?? null,
            status: 'FAILED',
            escrowLockStatus: 'NOT_LOCKED',
          },
        });
        if (claim.count !== 1) {
          throw new Error('This payment request has already been reviewed.');
        }
        await tx.order.update({ where: { id: payment.orderId }, data: { status: 'FAILED' } });
        await tx.notification.create({
          data: {
            userId: payment.order.userId,
            title: 'Payment needs attention',
            message: parsed.data.reviewNote?.trim() || 'The owner could not verify your payment. Contact marketplace support before submitting another payment.',
          },
        });
        return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      }

      const verifiedAt = new Date();
      const escrowReleaseAt = new Date(verifiedAt.getTime() + 48 * 60 * 60 * 1000);
      const order = await tx.order.update({ where: { id: payment.orderId }, data: { status: 'SUCCESS' } });
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, paymentVerificationState: 'PENDING' },
        data: {
          paymentVerificationState: 'CONFIRMED',
          paymentReviewNote: parsed.data.reviewNote ?? null,
          status: 'SUCCESS',
          escrowLockStatus: 'LOCKED',
          verifiedAt,
          escrowReleaseAt,
        },
      });
      if (claim.count !== 1) {
        throw new Error('This payment request has already been reviewed.');
      }
      const confirmed = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const existingPurchase = await tx.purchase.findFirst({
        where: { buyerId: order.userId, projectId: firstItem.projectId, orderId: order.id },
      });
      if (!existingPurchase) {
        await tx.purchase.create({
          data: {
            buyerId: order.userId,
            orderId: order.id,
            projectId: firstItem.projectId,
            projectVersionId: payment.projectVersionId,
            activationCode: randomBytes(18).toString('base64url'),
            paidAmount: payment.amount,
          },
        });
      }
      await tx.notification.create({
        data: {
          userId: order.userId,
          title: 'Payment verified',
          message: 'Your payment is confirmed and project access is ready. Your funds remain in the 48-hour consumer-protection escrow.',
        },
      });
      return confirmed;
    });
    return res.json({ ok: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to review this payment.';
    const status = message.includes('not found') ? 404 : message.includes('already') || message.includes('no project') ? 409 : 500;
    return res.status(status).json({ ok: false, message });
  }
});

adminRoutes.patch('/payments/:id/release-escrow', async (req, res) => {
  try {
    const payout = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id },
        include: {
          projectVersion: true,
          order: {
            include: {
              orderItems: { include: { project: { include: { seller: true } } } },
            },
          },
        },
      });
      if (!payment || payment.paymentVerificationState !== 'CONFIRMED' || payment.escrowLockStatus !== 'LOCKED') {
        throw new Error('A confirmed, locked escrow payment was not found.');
      }
      if (!payment.escrowReleaseAt || payment.escrowReleaseAt > new Date()) {
        throw new Error('The 48-hour escrow period has not matured.');
      }
      const item = payment.order.orderItems[0];
      if (!item) {
        throw new Error('The payment order has no project.');
      }
      const sellerProfile = item.project.seller;
      const agreedAmount = payment.projectVersionId
        ? payment.projectVersion?.developerAgreedPrice
        : item.project.developerAgreedPrice ?? Math.round(payment.amount * 0.8);
      if (agreedAmount === null || agreedAmount === undefined) {
        throw new Error('The owner has not set an agreed developer price for this paid update.');
      }
      const claim = await tx.payment.updateMany({
        where: {
          id: payment.id,
          paymentVerificationState: 'CONFIRMED',
          escrowLockStatus: 'LOCKED',
          escrowReleaseAt: { lte: new Date() },
        },
        data: { escrowLockStatus: 'RELEASED' },
      });
      if (claim.count !== 1) {
        throw new Error('Escrow has already been released or has not matured.');
      }
      const updatedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const sellerPayout = await tx.sellerPayout.create({
        data: { sellerProfileId: sellerProfile.id, paymentId: payment.id, amount: agreedAmount, status: 'READY_FOR_MANUAL_TRANSFER' },
      });
      await tx.sellerProfile.update({
        where: { id: sellerProfile.id },
        data: {
          balance: { increment: agreedAmount },
          totalEarnings: { increment: agreedAmount },
        },
      });
      await tx.notification.create({
        data: {
          userId: sellerProfile.userId,
          title: 'Escrow matured',
          message: 'A verified sale matured after the 48-hour hold. The owner has prepared your manual payout.',
        },
      });
      const platformFee = Math.max(0, payment.amount - agreedAmount);
      await tx.commission.create({
        data: {
          orderId: payment.orderId,
          grossAmount: payment.amount,
          rate: payment.amount > 0 ? platformFee / payment.amount * 100 : 0,
          platformFee,
          sellerShare: agreedAmount,
        },
      });
      return { payment: updatedPayment, sellerPayout, seller: sellerProfile };
    });
    return res.json({ ok: true, data: payout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to release escrow.';
    const status = message.includes('not found') ? 404 : message.includes('has not matured') || message.includes('no project') ? 409 : 500;
    return res.status(status).json({ ok: false, message });
  }
});

adminRoutes.get('/payouts', async (_req, res) => {
  try {
    const payouts = await prisma.sellerPayout.findMany({
      where: { status: 'READY_FOR_MANUAL_TRANSFER' },
      include: {
        sellerProfile: {
          include: { user: { select: { name: true, email: true } } },
        },
        payment: {
          include: {
            order: {
              include: {
                orderItems: { include: { project: { select: { title: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({
      ok: true,
      data: payouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount / 100,
        seller: payout.sellerProfile.user,
        developerUpiQrUrl: payout.sellerProfile.developerUpiQrUrl,
        projectTitle: payout.payment?.order.orderItems[0]?.project.title ?? 'Project sale',
        paymentId: payout.paymentId,
        status: payout.status,
        createdAt: payout.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load matured seller payouts.' });
  }
});

adminRoutes.patch('/payouts/:id/mark-paid', async (req, res) => {
  const parsed = z.object({
    transferReference: z.string().trim().min(4).max(100),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Enter the outbound bank or UPI transfer reference.' });
  }
  try {
    const payout = await prisma.$transaction(async (tx) => {
      const existing = await tx.sellerPayout.findUnique({
        where: { id: req.params.id },
        select: { id: true, amount: true, sellerProfileId: true, status: true },
      });
      if (!existing || existing.status !== 'READY_FOR_MANUAL_TRANSFER') {
        throw new Error('A ready seller payout was not found.');
      }
      const claimed = await tx.sellerPayout.updateMany({
        where: { id: existing.id, status: 'READY_FOR_MANUAL_TRANSFER' },
        data: {
          status: 'PAID',
          transferReference: parsed.data.transferReference,
          processedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new Error('This payout has already been processed.');
      }
      await tx.sellerProfile.update({
        where: { id: existing.sellerProfileId },
        data: { balance: { decrement: existing.amount } },
      });
      const seller = await tx.sellerProfile.findUniqueOrThrow({
        where: { id: existing.sellerProfileId },
        select: { userId: true },
      });
      await tx.notification.create({
        data: {
          userId: seller.userId,
          title: 'Manual payout recorded',
          message: `The owner recorded your ₹${(existing.amount / 100).toLocaleString('en-IN')} transfer. Check your payout details.`,
        },
      });
      return tx.sellerPayout.findUniqueOrThrow({ where: { id: existing.id } });
    });
    return res.json({ ok: true, data: payout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record the seller transfer.';
    const status = message.includes('not found') ? 404 : message.includes('already') ? 409 : 500;
    return res.status(status).json({ ok: false, message });
  }
});

adminRoutes.get('/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['BUYER', 'SELLER'] } },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ ok: true, data: users });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load marketplace accounts.' });
  }
});

adminRoutes.patch('/users/:id/status', async (req, res) => {
  const parsed = moderationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Invalid account status.' });
  }
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!target || target.role === 'ADMIN') {
      return res.status(404).json({ ok: false, message: 'Moderatable account not found.' });
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { status: parsed.data.status },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    return res.json({ ok: true, data: user });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to update account status.' });
  }
});

adminRoutes.put('/settings', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Provide a valid owner QR image URL and UPI ID.' });
  }
  try {
    const settings = await prisma.marketplaceSettings.upsert({
      where: { id: 'owner' },
      create: {
        id: 'owner',
        ownerUpiQrUrl: parsed.data.ownerUpiQrUrl || null,
        ownerUpiId: parsed.data.ownerUpiId || null,
      },
      update: {
        ownerUpiQrUrl: parsed.data.ownerUpiQrUrl || null,
        ownerUpiId: parsed.data.ownerUpiId || null,
      },
    });
    return res.json({ ok: true, data: settings });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to save owner payment settings.' });
  }
});

adminRoutes.patch('/projects/:id/approve', async (req, res) => {
  try {
    const parsed = projectApprovalSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: 'Invalid approval payload.', errors: parsed.error.flatten() });
    }

    const updatedProject = await prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: req.params.id },
        data: {
          status: parsed.data.status,
          projectStatus: parsed.data.status === 'APPROVED' ? 'Approved' : 'Pending',
        },
      });
      await tx.projectApproval.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          status: parsed.data.status,
          reviewedBy: req.user!.id,
          reviewNote: parsed.data.reviewNote ?? null,
          reviewedAt: new Date(),
        },
        update: {
          status: parsed.data.status,
          reviewedBy: req.user!.id,
          reviewNote: parsed.data.reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });
      return project;
    });

    res.json({ ok: true, data: updatedProject });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to update project status.' });
  }
});

adminRoutes.post('/coupons', async (req, res) => {
  const parsed = createCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Invalid coupon.', errors: parsed.error.flatten() });
  }

  try {
    const coupon = await prisma.coupon.create({
      data: {
        code: parsed.data.code,
        discountPercent: parsed.data.discountPercent,
        discountAmount: parsed.data.discountAmount,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
    });

    adminRoutes.get('/versions/review', async (_req, res) => {
      try {
        const versions = await prisma.projectVersion.findMany({
          where: { status: 'PENDING_REVIEW' },
          include: { project: { select: { id: true, title: true, seller: { select: { user: { select: { name: true, email: true } } } } } } },
          orderBy: { createdAt: 'asc' },
        });
        return res.json({ ok: true, data: versions });
      } catch (error) {
        return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load submitted project updates.' });
      }
    });

    adminRoutes.patch('/versions/:id/review', async (req, res) => {
      const parsed = z.object({
        decision: z.enum(['APPROVED', 'REJECTED']),
        reviewNote: z.string().trim().max(500).optional(),
        paidUpdate: z.boolean().default(false),
        updatePrice: z.number().int().min(100).optional(),
        developerAgreedPrice: z.number().int().min(0).optional(),
      }).refine((value) => value.decision !== 'APPROVED' || !value.paidUpdate ||
        (value.updatePrice !== undefined && value.developerAgreedPrice !== undefined), {
        message: 'A paid update must include both retail and agreed seller prices in paise.',
        path: ['updatePrice'],
      }).refine((value) => value.decision !== 'APPROVED' || !value.paidUpdate ||
        (value.updatePrice !== undefined && value.developerAgreedPrice !== undefined && value.developerAgreedPrice <= value.updatePrice), {
        message: 'Seller agreed price cannot exceed the paid update retail price.',
        path: ['developerAgreedPrice'],
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, message: 'Provide a valid update decision and paid-update price.' });
      try {
        const version = await prisma.$transaction(async (tx) => {
          const current = await tx.projectVersion.findUnique({
            where: { id: String(req.params.id) },
            include: { project: { select: { id: true, title: true } } },
          });
          if (!current || current.status !== 'PENDING_REVIEW') throw new Error('A pending project update was not found.');
          const updated = await tx.projectVersion.update({
            where: { id: current.id },
            data: {
              status: parsed.data.decision,
              reviewNote: parsed.data.reviewNote ?? null,
              paidUpdate: parsed.data.decision === 'APPROVED' && parsed.data.paidUpdate,
              updatePrice: parsed.data.decision === 'APPROVED' && parsed.data.paidUpdate ? parsed.data.updatePrice! : null,
              developerAgreedPrice: parsed.data.decision === 'APPROVED' && parsed.data.paidUpdate ? parsed.data.developerAgreedPrice! : null,
            },
          });
          if (parsed.data.decision === 'APPROVED') {
            await tx.project.update({ where: { id: current.projectId }, data: { version: current.version } });
            const buyers = await tx.purchase.findMany({
              where: { projectId: current.projectId, projectVersionId: null },
              select: { buyerId: true },
              distinct: ['buyerId'],
            });
            if (buyers.length > 0) {
              await tx.notification.createMany({
                data: buyers.map(({ buyerId }) => ({
                  userId: buyerId,
                  title: 'Project update available',
                  message: `${current.project.title} v${current.version} is now available${updated.paidUpdate ? ' as a paid update' : ' at no additional cost'}.`,
                })),
              });
            }
          }
          return updated;
        });
        return res.json({ ok: true, data: version });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to review project update.';
        return res.status(message.includes('not found') ? 404 : 500).json({ ok: false, message });
      }
    });
    return res.status(201).json({ ok: true, data: { code: coupon.code, active: coupon.active } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ ok: false, message: 'A coupon with this code already exists.' });
    }
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to create coupon.' });
  }
});
