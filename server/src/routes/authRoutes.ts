import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const authRoutes = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['BUYER', 'SELLER']).default('BUYER'),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const userRoleSchema = z.enum(['BUYER', 'SELLER', 'ADMIN']);

const JWT_SECRET = process.env.JWT_SECRET ?? 'development-secret';

const createToken = (user: { id: string; email: string; role: z.infer<typeof userRoleSchema> }) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' as const });

authRoutes.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: 'Validation failed.', errors: parsed.error.flatten() });
    }

    const { name, email, password, role } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ ok: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role,
      },
    });

    if (role === 'SELLER') {
      await prisma.sellerProfile.create({
        data: {
          userId: user.id,
          status: 'PENDING_VERIFICATION',
          skills: JSON.stringify([]),
          balance: 0,
          totalEarnings: 0,
        },
      });
    }

    if (role === 'BUYER') {
      await prisma.buyerProfile.create({
        data: {
          userId: user.id,
        },
      });
    }

    const token = createToken({ id: user.id, email: user.email, role });

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to complete registration.' });
  }
});

authRoutes.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: 'Validation failed.', errors: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ ok: false, message: 'This account is inactive or access has been restricted.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
    }

    const role = userRoleSchema.safeParse(user.role);
    if (!role.success) {
      return res.status(500).json({ ok: false, message: 'This account has an invalid role configuration.' });
    }

    const token = createToken({ id: user.id, email: user.email, role: role.data });

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role.data,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to sign in.' });
  }
});

authRoutes.post('/logout', async (_req, res) => {
  res.json({ ok: true, message: 'Logged out successfully.' });
});

authRoutes.post('/forgot-password', async (_req, res) => {
  res.json({ ok: true, message: 'Password reset flow ready for implementation.' });
});
