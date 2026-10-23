import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

export const customRequestRoutes = Router();

const createRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional(),
  projectType: z.string().trim().min(2).max(80),
  description: z.string().trim().min(20).max(5000),
  budget: z.string().trim().max(100).optional(),
  timeline: z.string().trim().max(100).optional(),
});

const updateRequestSchema = createRequestSchema.partial().extend({
  status: z.enum(['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one field to update.',
});

customRequestRoutes.post('/', async (req, res) => {
  const parsed = createRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Validation failed.', errors: parsed.error.flatten() });
  }

  try {
    const request = await prisma.customSoftwareRequest.create({
      data: {
        ...parsed.data,
        email: parsed.data.email.toLowerCase(),
      },
    });

    return res.status(201).json({ ok: true, data: request });
  } catch {
    return res.status(500).json({ ok: false, message: 'Unable to save your request. Please try again.' });
  }
});

customRequestRoutes.use(authenticateJWT, requireRole(['ADMIN']));

customRequestRoutes.get('/', async (_req, res) => {
  try {
    const requests = await prisma.customSoftwareRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json({ ok: true, data: requests });
  } catch {
    return res.status(500).json({ ok: false, message: 'Unable to load custom software requests.' });
  }
});

customRequestRoutes.get('/:id', async (req, res) => {
  try {
    const request = await prisma.customSoftwareRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) {
      return res.status(404).json({ ok: false, message: 'Request not found.' });
    }

    return res.json({ ok: true, data: request });
  } catch {
    return res.status(500).json({ ok: false, message: 'Unable to load the request.' });
  }
});

customRequestRoutes.patch('/:id', async (req, res) => {
  const parsed = updateRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Validation failed.', errors: parsed.error.flatten() });
  }

  try {
    const request = await prisma.customSoftwareRequest.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
      },
    });

    return res.json({ ok: true, data: request });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'Request not found.' });
    }

    return res.status(500).json({ ok: false, message: 'Unable to update the request.' });
  }
});

customRequestRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.customSoftwareRequest.delete({
      where: { id: req.params.id },
    });

    return res.json({ ok: true, message: 'Request deleted.' });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return res.status(404).json({ ok: false, message: 'Request not found.' });
    }

    return res.status(500).json({ ok: false, message: 'Unable to delete the request.' });
  }
});
