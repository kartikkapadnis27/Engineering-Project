import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

export const institutionRoutes = Router();

institutionRoutes.get('/mine', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    const memberships = await prisma.institutionMembership.findMany({
      where: { userId: req.user!.id, status: 'ACTIVE' },
      include: { license: { select: { institutionName: true, expiresAt: true, status: true, categories: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, data: memberships });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load institution access.' });
  }
});

institutionRoutes.post('/redeem', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  const parsed = z.object({ code: z.string().trim().min(8).max(40).toUpperCase() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: 'Enter a valid institution access code.' });
  try {
    const membership = await prisma.$transaction(async (tx) => {
      const license = await tx.institutionLicense.findUnique({ where: { code: parsed.data.code } });
      if (!license || license.status !== 'ACTIVE' || license.expiresAt <= new Date()) {
        throw new Error('This institution license is invalid, inactive, or expired.');
      }
      try {
        const categories: unknown = JSON.parse(license.categories);
        if (!Array.isArray(categories) || categories.length === 0 || !categories.every((item) => typeof item === 'string')) {
          throw new Error('The institution license has invalid category configuration.');
        }
      } catch {
        throw new Error('The institution license has invalid category configuration.');
      }
      const existing = await tx.institutionMembership.findUnique({
        where: { licenseId_userId: { licenseId: license.id, userId: req.user!.id } },
      });
      if (existing?.status === 'ACTIVE') return { membership: existing, license };
      const claimed = await tx.institutionLicense.updateMany({
        where: {
          id: license.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          claimedSeats: { lt: license.maxSeats },
        },
        data: { claimedSeats: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new Error('This institution license is inactive, expired, or has reached its seat limit.');
      const created = existing
        ? await tx.institutionMembership.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } })
        : await tx.institutionMembership.create({ data: { licenseId: license.id, userId: req.user!.id } });
      return { membership: created, license };
    });
    return res.status(201).json({
      ok: true,
      data: {
        institutionName: membership.license.institutionName,
        expiresAt: membership.license.expiresAt,
        status: membership.membership.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to redeem institution license.';
    return res.status(message.includes('invalid') || message.includes('category') ? 400 : message.includes('seat') ? 409 : 500)
      .json({ ok: false, message });
  }
});

const adminInstitutionRoutes = Router();
adminInstitutionRoutes.use(authenticateJWT, requireRole(['ADMIN']));

adminInstitutionRoutes.get('/', async (_req, res) => {
  try {
    const licenses = await prisma.institutionLicense.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ ok: true, data: licenses.map((license) => ({ ...license, activeSeats: license.claimedSeats })) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load institution licenses.' });
  }
});

adminInstitutionRoutes.post('/', async (req, res) => {
  const parsed = z.object({
    institutionName: z.string().trim().min(2).max(160),
    categories: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
    maxSeats: z.number().int().min(1).max(100_000),
    annualPrice: z.number().int().min(100),
    paymentReference: z.string().trim().min(4).max(100),
    expiresAt: z.string().datetime(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: 'Provide institution terms, an annual amount, an already-received payment reference, and an expiry date.' });
  const expiresAt = new Date(parsed.data.expiresAt);
  if (expiresAt <= new Date()) return res.status(400).json({ ok: false, message: 'License expiry must be in the future.' });
  try {
    const license = await prisma.institutionLicense.create({
      data: {
        code: randomBytes(12).toString('hex').toUpperCase(),
        institutionName: parsed.data.institutionName,
        categories: JSON.stringify([...new Set(parsed.data.categories)]),
        maxSeats: parsed.data.maxSeats,
        annualPrice: parsed.data.annualPrice,
        paymentReference: parsed.data.paymentReference,
        expiresAt,
        createdById: req.user!.id,
      },
    });
    return res.status(201).json({ ok: true, data: { ...license, activeSeats: 0 } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to create institution license.' });
  }
});

adminInstitutionRoutes.patch('/:id/status', async (req, res) => {
  const parsed = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: 'Select ACTIVE or SUSPENDED.' });
  try {
    const updated = await prisma.institutionLicense.update({
      where: { id: String(req.params.id) },
      data: { status: parsed.data.status },
    });
    return res.json({ ok: true, data: updated });
  } catch (error) {
    return res.status(404).json({ ok: false, message: error instanceof Error ? error.message : 'Institution license not found.' });
  }
});

institutionRoutes.use('/admin', adminInstitutionRoutes);
