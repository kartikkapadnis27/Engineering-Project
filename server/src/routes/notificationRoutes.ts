import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

export const notificationRoutes = Router();
notificationRoutes.use(authenticateJWT);

notificationRoutes.get('/', async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    return res.json({ ok: true, data: { notifications, unreadCount } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load notifications.' });
  }
});

notificationRoutes.patch('/read-all', async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    return res.json({ ok: true, data: { markedRead: result.count } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to mark notifications read.' });
  }
});

notificationRoutes.patch('/:id/read', async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    if (result.count === 0) {
      const existing = await prisma.notification.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, select: { id: true } });
      if (!existing) return res.status(404).json({ ok: false, message: 'Notification not found.' });
    }
    return res.json({ ok: true, data: { isRead: true } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to update notification.' });
  }
});
