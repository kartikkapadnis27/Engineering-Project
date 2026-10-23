import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import { buildProjectFileName, ensureUploadDirectory } from '../utils/fileStorage.js';
import { buildProjectReportPdf } from '../utils/projectReport.js';
import { analyzeProjectArchive } from '../utils/projectAnalysis.js';

export const featureRoutes = Router();

const updateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, ensureUploadDirectory('private')),
    filename: (_req, file, callback) => callback(null, buildProjectFileName(file.originalname)),
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip' ||
        !['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype)) {
      callback(new Error('A ZIP archive is required for a project update.'));
      return;
    }
    callback(null, true);
  },
});

const contactPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b[A-Z0-9._-]{2,}@(?!codemarket\b)[A-Z0-9.-]{2,}\b/i,
  /(?:https?:\/\/|www\.|wa\.me\/|t\.me\/|discord\.gg\/|instagram\.com\/|facebook\.com\/)/i,
  /\b(?:whats\s*app|telegram|phonepe|google\s*pay|gpay|paytm|upi|ifsc|bank\s+account|account\s+number)\b/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/,
];

function parseStack(tags: string) {
  try {
    const value: unknown = JSON.parse(tags);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return tags.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function practiceQuestions(technologies: string[]) {
  const questions = new Set<string>([
    'What user problem does this project solve, and who are its primary users?',
    'Walk through the request or data flow from the user interface to persistence.',
    'How are invalid input and operational errors handled?',
    'What security assumptions does this design make, and how would you test them?',
    'Which design trade-off would you revisit if the system had ten times more users?',
  ]);
  for (const technology of technologies.slice(0, 8)) {
    questions.add(`Where is ${technology} used in this project, and why was it selected?`);
  }
  return [...questions].slice(0, 12);
}

async function findAccessibleProject(projectId: string, userId: string, role: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, status: 'APPROVED' },
    include: { category: true, seller: true, versions: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' } } },
  });
  if (!project) return null;
  if (role === 'ADMIN' || (role === 'SELLER' && project.seller.userId === userId)) return project;

  const purchase = await prisma.purchase.findFirst({ where: { buyerId: userId, projectId: project.id } });
  if (purchase) return project;
  const memberships = await prisma.institutionMembership.findMany({
    where: { userId, status: 'ACTIVE', license: { status: 'ACTIVE', expiresAt: { gt: new Date() } } },
    include: { license: true },
  });
  const hasInstitutionAccess = memberships.some((membership) => {
    try {
      const categories: unknown = JSON.parse(membership.license.categories);
      return Array.isArray(categories) && (categories.includes('*') || categories.includes(project.category.name));
    } catch {
      return false;
    }
  });
  return hasInstitutionAccess ? project : null;
}

featureRoutes.post('/:id/price-alert', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: String(req.params.id), status: 'APPROVED' }, select: { id: true } });
    if (!project) return res.status(404).json({ ok: false, message: 'Approved project not found.' });
    await prisma.priceAlert.upsert({
      where: { userId_projectId: { userId: req.user!.id, projectId: project.id } },
      create: { userId: req.user!.id, projectId: project.id },
      update: {},
    });
    return res.json({ ok: true, data: { subscribed: true } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to subscribe to price alerts.' });
  }
});

featureRoutes.get('/:id/price-alert', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    const alert = await prisma.priceAlert.findUnique({
      where: { userId_projectId: { userId: req.user!.id, projectId: String(req.params.id) } },
      select: { id: true },
    });
    return res.json({ ok: true, data: { subscribed: Boolean(alert) } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load price alert status.' });
  }
});

featureRoutes.delete('/:id/price-alert', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    await prisma.priceAlert.deleteMany({ where: { userId: req.user!.id, projectId: String(req.params.id) } });
    return res.json({ ok: true, data: { subscribed: false } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to remove price alert.' });
  }
});

featureRoutes.get('/:id/insights', async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      select: { id: true, title: true, tags: true, sourceAnalysis: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Approved project not found.' });
    const analysis = project.sourceAnalysis ? JSON.parse(project.sourceAnalysis) as {
      archiveFileCount: number; sourceFileCount: number; linesOfCode: number; dependencyCount: number; languages: string[]; reviewFlags: string[];
    } : { archiveFileCount: 0, sourceFileCount: 0, linesOfCode: 0, dependencyCount: 0, languages: [], reviewFlags: [] };
    const stack = parseStack(project.tags);
    const nodes = [
      { id: 'client', label: 'Application layer', detail: stack.slice(0, 2).join(' · ') || 'Project UI' },
      { id: 'services', label: 'Service layer', detail: stack.slice(2, 4).join(' · ') || 'Business logic' },
      { id: 'data', label: 'Data layer', detail: stack[4] || 'Storage / persistence' },
    ];
    return res.json({
      ok: true,
      data: {
        analysis: {
          archiveFileCount: analysis.archiveFileCount,
          sourceFileCount: analysis.sourceFileCount,
          linesOfCode: analysis.linesOfCode,
          dependencyCount: analysis.dependencyCount,
          languages: analysis.languages,
          reviewFlags: analysis.reviewFlags,
        },
        architecture: { nodes, edges: [['client', 'services'], ['services', 'data']] },
        practiceQuestions: practiceQuestions(stack),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to build project insights.' });
  }
});

featureRoutes.get('/:id/report.pdf', authenticateJWT, async (req, res) => {
  try {
    const project = await findAccessibleProject(String(req.params.id), req.user!.id, req.user!.role);
    if (!project) return res.status(403).json({ ok: false, message: 'Purchase the project or use an active institution license to generate its report.' });
    const analysis = project.sourceAnalysis ? JSON.parse(project.sourceAnalysis) as {
      sourceFileCount: number; linesOfCode: number; dependencyCount: number; readme: string;
    } : { sourceFileCount: 0, linesOfCode: 0, dependencyCount: 0, readme: '' };
    const report = buildProjectReportPdf({
      title: project.title,
      category: project.category.name,
      description: project.fullDescription,
      technologies: parseStack(project.tags),
      version: project.version ?? '1.0.0',
      sourceFileCount: analysis.sourceFileCount,
      linesOfCode: analysis.linesOfCode,
      dependencyCount: analysis.dependencyCount,
      readme: analysis.readme,
      generatedAt: new Date(),
    });

    const filename = `${project.title.replace(/[^a-z0-9-]/gi, '-').slice(0, 60)}-documentation.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(report);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to generate the project report.' });
  }
});

featureRoutes.get('/:id/institution-access', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      include: { category: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Approved project not found.' });
    const memberships = await prisma.institutionMembership.findMany({
      where: { userId: req.user!.id, status: 'ACTIVE', license: { status: 'ACTIVE', expiresAt: { gt: new Date() } } },
      include: { license: true },
    });
    const membership = memberships.find((candidate) => {
      try {
        const categories: unknown = JSON.parse(candidate.license.categories);
        return Array.isArray(categories) && (categories.includes('*') || categories.includes(project.category.name));
      } catch {
        return false;
      }
    });
    if (!membership) return res.status(403).json({ ok: false, message: 'No active institution license covers this project category.' });
    const token = jwt.sign(
      { projectId: project.id, buyerId: req.user!.id, licenseId: membership.licenseId },
      process.env.JWT_SECRET ?? 'development-secret',
      { expiresIn: '10m' },
    );
    return res.json({
      ok: true,
      data: {
        institutionName: membership.license.institutionName,
        downloadLink: `/api/projects/download?token=${token}`,
        expiresInSeconds: 600,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to issue institution access.' });
  }
});

featureRoutes.get('/:id/conversations', authenticateJWT, requireRole(['SELLER']), async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED', seller: { userId: req.user!.id } },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Your project was not found.' });
    const threads = await prisma.projectMessage.groupBy({
      by: ['buyerId'],
      where: { projectId: project.id },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    const buyers = await prisma.user.findMany({
      where: { id: { in: threads.map((thread) => thread.buyerId) } },
      select: { id: true, name: true, email: true },
    });
    return res.json({
      ok: true,
      data: threads.map((thread) => ({
        buyer: buyers.find((buyer) => buyer.id === thread.buyerId),
        lastMessageAt: thread._max.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load buyer conversations.' });
  }
});

featureRoutes.get('/:id/messages', authenticateJWT, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      include: { seller: true },
    });
    if (!project || (req.user!.role === 'SELLER' && project.seller.userId !== req.user!.id)) {
      return res.status(404).json({ ok: false, message: 'Project conversation not found.' });
    }
    const buyerId = req.user!.role === 'BUYER' ? req.user!.id :
      typeof req.query.buyerId === 'string' ? req.query.buyerId : '';
    if (!buyerId) return res.status(400).json({ ok: false, message: 'Choose a buyer conversation.' });
    if (req.user!.role === 'SELLER') {
      const threadExists = await prisma.projectMessage.findFirst({ where: { projectId: project.id, buyerId }, select: { id: true } });
      if (!threadExists) return res.status(404).json({ ok: false, message: 'Buyer conversation not found.' });
    }
    const messages = await prisma.projectMessage.findMany({
      where: { projectId: project.id, buyerId },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return res.json({ ok: true, data: messages });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load project messages.' });
  }
});

featureRoutes.post('/:id/messages', authenticateJWT, requireRole(['BUYER', 'SELLER']), async (req, res) => {
  const parsed = z.object({
    content: z.string().trim().min(2).max(2000),
    buyerId: z.string().trim().min(1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: 'Enter a message between 2 and 2,000 characters.' });
  const blockedPattern = contactPatterns.find((pattern) => pattern.test(parsed.data.content));
  if (blockedPattern) {
    return res.status(400).json({ ok: false, message: 'For account safety, external contact details, payment handles, and contact links are not allowed in marketplace chat.' });
  }
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      include: { seller: true },
    });
    if (!project || (req.user!.role === 'SELLER' && project.seller.userId !== req.user!.id)) {
      return res.status(404).json({ ok: false, message: 'Project conversation not found.' });
    }
    const buyerId = req.user!.role === 'BUYER' ? req.user!.id : parsed.data.buyerId;
    if (!buyerId) return res.status(400).json({ ok: false, message: 'Choose the buyer conversation to reply to.' });
    if (req.user!.role === 'SELLER') {
      const threadExists = await prisma.projectMessage.findFirst({ where: { projectId: project.id, buyerId }, select: { id: true } });
      if (!threadExists) return res.status(404).json({ ok: false, message: 'Buyer conversation not found.' });
    }
    const recentCount = await prisma.projectMessage.count({
      where: { senderId: req.user!.id, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
    if (recentCount >= 30) return res.status(429).json({ ok: false, message: 'Message limit reached. Please wait before sending more messages.' });
    const message = await prisma.projectMessage.create({
      data: { projectId: project.id, senderId: req.user!.id, buyerId, content: parsed.data.content },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
    return res.status(201).json({ ok: true, data: message });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to send project message.' });
  }
});

featureRoutes.get('/:id/viva', async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      select: { id: true, title: true, tags: true, sourceAnalysis: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Approved project not found.' });
    const analysis = project.sourceAnalysis ? JSON.parse(project.sourceAnalysis) as { languages: string[] } : { languages: [] };
    return res.json({
      ok: true,
      data: {
        mode: 'guided-offline',
        notice: 'Guided practice prompts are generated locally from project metadata; no external AI assessment is configured.',
        questions: practiceQuestions([...new Set([...parseStack(project.tags), ...analysis.languages])]),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to prepare viva practice.' });
  }
});

featureRoutes.post('/:id/versions', authenticateJWT, requireRole(['SELLER']), updateUpload.single('projectZip'), async (req, res) => {
  const file = req.file;
  const parsed = z.object({
    version: z.string().trim().min(1).max(40),
    notes: z.string().trim().max(2000).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !file) {
    if (file) await fs.unlink(file.path);
    return res.status(400).json({ ok: false, message: 'Provide a version label, update notes, and a ZIP source archive.' });
  }
  try {
    const headerFile = await fs.open(file.path, 'r');
    let validZip = false;
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await headerFile.read(header, 0, 4, 0);
      validZip = bytesRead === 4 && header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    } finally {
      await headerFile.close();
    }
    if (!validZip) {
      await fs.unlink(file.path);
      return res.status(400).json({ ok: false, message: 'The update file is not a valid ZIP archive.' });
    }
    await analyzeProjectArchive(file.path);
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), seller: { userId: req.user!.id } },
      select: { id: true },
    });
    if (!project) {
      await fs.unlink(file.path);
      return res.status(404).json({ ok: false, message: 'Your project was not found.' });
    }
    const duplicate = await prisma.projectVersion.findFirst({ where: { projectId: project.id, version: parsed.data.version } });
    if (duplicate) {
      await fs.unlink(file.path);
      return res.status(409).json({ ok: false, message: 'That version label already exists for this project.' });
    }
    const version = await prisma.projectVersion.create({
      data: {
        projectId: project.id,
        version: parsed.data.version,
        notes: parsed.data.notes || null,
        status: 'PENDING_REVIEW',
      },
    });
    await prisma.projectFile.create({
      data: {
        projectId: project.id,
        versionId: version.id,
        fileName: file.originalname,
        storageKey: file.path,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
    return res.status(201).json({ ok: true, message: 'Update submitted for owner review.', data: version });
  } catch (error) {
    await fs.unlink(file.path).catch(() => undefined);
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to submit project update.' });
  }
});

featureRoutes.get('/:id/versions', async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), status: 'APPROVED' },
      select: { id: true },
    });

    if (!project) return res.status(404).json({ ok: false, message: 'Approved project not found.' });
    const versions = await prisma.projectVersion.findMany({
      where: { projectId: project.id, status: 'APPROVED' },
      select: { id: true, version: true, notes: true, paidUpdate: true, updatePrice: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, data: versions });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load project update history.' });
  }
});

featureRoutes.get('/:id/versions/manage', authenticateJWT, requireRole(['SELLER']), async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), seller: { userId: req.user!.id } },
      select: { id: true, version: true },
    });
    if (!project) return res.status(404).json({ ok: false, message: 'Your project was not found.' });
    const versions = await prisma.projectVersion.findMany({
      where: { projectId: project.id },
      select: { id: true, version: true, notes: true, status: true, reviewNote: true, paidUpdate: true, updatePrice: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, data: { currentVersion: project.version, versions } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load seller project updates.' });
  }
});
