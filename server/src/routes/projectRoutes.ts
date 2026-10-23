import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import { buildProjectFileName, ensureUploadDirectory, publicUploadUrl } from '../utils/fileStorage.js';
import { analyzeProjectArchive } from '../utils/projectAnalysis.js';
import { cleanupProjectDelivery, prepareWatermarkedDownload } from '../utils/projectDelivery.js';

export const projectRoutes = Router();
const serverPublicUrl = (process.env.SERVER_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, '');

const projectUploadSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(80),
  frontend: z.string().trim().optional(),
  backend: z.string().trim().optional(),
  database: z.string().trim().optional(),
  version: z.string().trim().min(1).default('1.0.0'),
  price: z.union([z.string(), z.number()]).transform((value) => Number(value)).pipe(z.number().min(1)),
  demoUrl: z.string().trim().url().optional().or(z.literal('')),
});

const sellerProfileSchema = z.object({
  whatsappNumber: z.string().trim().max(30).regex(/^[+0-9() -]*$/).optional(),
  developerUpiQrUrl: z.string().trim().url().max(2048).refine((value) => value.startsWith('https://')).or(z.literal('')).optional(),
});

const fileStorage = multer.diskStorage({
  destination: (_req, file, callback) => {
    callback(null, ensureUploadDirectory(file.fieldname === 'projectZip' ? 'private' : 'public'));
  },
  filename: (_req, file, callback) => {
    callback(null, buildProjectFileName(file.originalname));
  },
});

const upload = multer({
  storage: fileStorage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

const projectUpload = upload.fields([
  { name: 'projectZip', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'demoVideo', maxCount: 1 },
]);

async function hasZipLocalFileHeader(filePath: string) {
  const archive = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await archive.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  } finally {
    await archive.close();
  }
}

const slugify = (input: string) =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const parseTechnologies = (tags: string) => {
  try {
    const parsed: unknown = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0) : [];
  } catch {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
};

const formatProjectResponse = (project: any) => ({
  id: project.id,
  title: project.title,
  category: project.category?.name ?? 'Uncategorized',
  shortDescription: project.shortDescription,
  description: project.fullDescription,
  price: Number(project.studentRetailPrice ?? project.price) / 100,
  integrityScore: project.integrityScore ?? 0,
  codeMarketAssured: project.codeMarketAssured ?? false,
  projectStatus: project.status === 'APPROVED' ? 'Approved' : project.projectStatus ?? 'Pending',
  rating: project.rating ?? 0,
  reviews: project.reviewCount ?? 0,
  technologies: parseTechnologies(project.tags),
  seller: project.seller?.user?.name ?? 'Verified seller',
  demoUrl: project.demoUrl ?? '',
  demoVideo: project.demoVideo ? `${serverPublicUrl}${project.demoVideo}` : '',
  thumbnail: project.thumbnail ? `${serverPublicUrl}${project.thumbnail}` : '',
  status: project.status,
  version: project.version,
  uploadedAt: project.uploadedAt,
});

projectRoutes.get('/', async (req, res) => {
  try {
    const searchValue = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const categoryValue = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const minPrice = Number(req.query.minPrice ?? 0);
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;

    const where: Record<string, any> = {
      status: 'APPROVED',
    };

    if (categoryValue) {
      where.category = {
        name: {
          equals: categoryValue,
        },
      };
    }

    if (searchValue) {
      where.OR = [
        { title: { contains: searchValue } },
        { fullDescription: { contains: searchValue } },
        { tags: { contains: searchValue } },
      ];
    }

    if (minPrice > 0 || maxPrice) {
      where.price = {
        gte: Math.round((minPrice || 0) * 100),
        ...(maxPrice ? { lte: Math.round(maxPrice * 100) } : {}),
      };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      include: {
        category: true,
        seller: {
          include: {
            user: true,
          },
        },
      },
    });

    res.json({
      ok: true,
      data: projects.map(formatProjectResponse),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load approved projects.' });
  }
});

projectRoutes.get('/mine', authenticateJWT, requireRole(['SELLER']), async (req, res) => {
  try {
    const seller = await prisma.sellerProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        projects: {
          orderBy: { uploadedAt: 'desc' },
          include: {
            category: true,
            approval: true,
            purchases: { select: { paidAmount: true } },
          },
        },
      },
    });

    if (!seller) {
      return res.status(404).json({ ok: false, message: 'Seller profile not found.' });
    }

    const totalSales = seller.projects.reduce((count, project) => count + project.purchases.length, 0);
    const reviewCount = seller.projects.reduce((total, project) => total + project.reviewCount, 0);
    const averageRating = reviewCount > 0
      ? seller.projects.reduce((total, project) => total + project.rating * project.reviewCount, 0) / reviewCount
      : 0;
    const loyaltyTier = totalSales >= 50 && averageRating >= 4.7
      ? { name: 'Elite Architect', commissionRate: 8 }
      : totalSales >= 10 && averageRating >= 4.4
        ? { name: 'Silver Developer', commissionRate: 12 }
        : { name: 'Bronze Developer', commissionRate: 15 };
    return res.json({
      ok: true,
      data: {
        sellerProfile: {
          whatsappNumber: seller.whatsappNumber ?? '',
          developerUpiQrUrl: seller.developerUpiQrUrl ?? '',
        },
        stats: {
          totalProjects: seller.projects.length,
          totalSales,
          earnings: seller.totalEarnings / 100,
          averageRating: Math.round(averageRating * 100) / 100,
          loyaltyTier,
        },
        projects: seller.projects.map((project) => ({
          ...formatProjectResponse(project),
          reviewNote: project.approval?.reviewNote ?? null,
          sales: project.purchases.length,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load seller dashboard.' });
  }
});

projectRoutes.patch('/seller-profile', authenticateJWT, requireRole(['SELLER']), async (req, res) => {
  const parsed = sellerProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Provide a valid WhatsApp number and QR image URL.', errors: parsed.error.flatten() });
  }
  try {
    const profile = await prisma.sellerProfile.update({
      where: { userId: req.user!.id },
      data: {
        ...(parsed.data.whatsappNumber === undefined ? {} : { whatsappNumber: parsed.data.whatsappNumber || null }),
        ...(parsed.data.developerUpiQrUrl === undefined ? {} : { developerUpiQrUrl: parsed.data.developerUpiQrUrl || null }),
      },
      select: { whatsappNumber: true, developerUpiQrUrl: true },
    });
    return res.json({ ok: true, data: profile });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to update seller payout details.' });
  }
});

projectRoutes.get('/download', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : null;
    if (!token) {
      return res.status(401).json({ ok: false, message: 'Download token is required.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'development-secret');
    if (typeof payload === 'string' || typeof payload.projectId !== 'string' || typeof payload.buyerId !== 'string') {
      return res.status(401).json({ ok: false, message: 'Invalid download token.' });
    }
    const buyerId = payload.buyerId;
    const projectId = payload.projectId;
    const user = await prisma.user.findUnique({ where: { id: buyerId }, select: { status: true, role: true, email: true } });
    if (!user || user.status !== 'ACTIVE' || user.role !== 'BUYER') {
      return res.status(403).json({ ok: false, message: 'Buyer access is inactive.' });
    }

    if (typeof payload.licenseId === 'string') {
      const project = await prisma.project.findFirst({
        where: { id: projectId, status: 'APPROVED' },
        include: { category: true },
      });
      const membership = await prisma.institutionMembership.findFirst({
        where: {
          licenseId: payload.licenseId,
          userId: buyerId,
          status: 'ACTIVE',
          license: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
        },
        include: { license: true },
      });
      let categoryAllowed = false;
      try {
        const categories: unknown = JSON.parse(membership?.license.categories ?? '[]');
        categoryAllowed = Array.isArray(categories) &&
          (categories.includes('*') || Boolean(project && categories.includes(project.category.name)));
      } catch {
        categoryAllowed = false;
      }
      if (!project || !membership || !categoryAllowed) {
        return res.status(403).json({ ok: false, message: 'Institution license access is not active for this project.' });
      }
      const file = await prisma.projectFile.findFirst({
        where: {
          projectId,
          OR: [
            { versionId: null },
            { version: { status: 'APPROVED', paidUpdate: false } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!file) return res.status(404).json({ ok: false, message: 'Project source is unavailable.' });
      const delivery = await prepareWatermarkedDownload(
        file,
        { id: buyerId, email: user.email },
        { purchaseId: membership.id, activationCode: membership.id, issuedAt: membership.createdAt },
      );
      return res.download(delivery.outputPath, delivery.fileName, (error) => {
        void cleanupProjectDelivery(delivery.directory);
        if (error) {
          console.error('Institution project archive delivery failed.', error);
          if (!res.headersSent) res.status(500).json({ ok: false, message: 'Unable to deliver the project archive.' });
        }
      });
    }

    const purchase = typeof payload.purchaseId === 'string'
      ? await prisma.purchase.findFirst({ where: { id: payload.purchaseId, buyerId, projectId } })
      : typeof payload.orderId === 'string'
        ? await prisma.purchase.findFirst({ where: { buyerId, projectId, orderId: payload.orderId } })
        : null;
    if (!purchase) return res.status(404).json({ ok: false, message: 'Download not found or access expired.' });
    const file = purchase.projectVersionId
      ? await prisma.projectFile.findFirst({ where: { projectId, versionId: purchase.projectVersionId } })
      : await prisma.projectFile.findFirst({
        where: {
          projectId,
          OR: [
            { versionId: null },
            { version: { status: 'APPROVED', paidUpdate: false } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    if (!file) return res.status(404).json({ ok: false, message: 'Project source is unavailable.' });
      const activationCode = purchase.activationCode ?? randomBytes(24).toString('base64url');
      if (!purchase.activationCode) {
        await prisma.purchase.update({ where: { id: purchase.id }, data: { activationCode } });
      }
      const delivery = await prepareWatermarkedDownload(
        file,
        { id: buyerId, email: user.email },
        { purchaseId: purchase.id, activationCode, issuedAt: purchase.createdAt },
      );
      await prisma.download.create({ data: { purchaseId: purchase.id, userId: buyerId } });
      return res.download(delivery.outputPath, delivery.fileName, (error) => {
        void cleanupProjectDelivery(delivery.directory);
        if (error) {
          console.error('Purchased project archive delivery failed.', error);
          if (!res.headersSent) res.status(500).json({ ok: false, message: 'Unable to deliver the project archive.' });
        }
      });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ ok: false, message: 'Download link is invalid or expired. Request a fresh access link.' });
    }
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to download the project.' });
  }
});

projectRoutes.get('/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        seller: { include: { user: true } },
        projectFiles: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true } } },
        },
      },
    });

    if (!project || project.status !== 'APPROVED') {
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }

    res.json({
      ok: true,
      data: {
        ...formatProjectResponse(project),
        seller: project.seller.user.name,
        comments: project.comments.map((comment) => ({
          id: comment.id,
          comment: comment.comment,
          author: comment.user.name,
          createdAt: comment.createdAt,
        })),
        files: project.projectFiles.map((file: any) => ({
          id: file.id,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to load project details.' });
  }
});

projectRoutes.post('/upload', authenticateJWT, requireRole(['SELLER']), projectUpload, async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const uploadedFiles = Object.values(files ?? {}).flat();
  const removeUploads = async () => {
    await Promise.all(uploadedFiles.map((file) => fs.unlink(file.path).catch(() => undefined)));
  };

  try {
    const parsed = projectUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      await removeUploads();
      return res.status(400).json({ ok: false, message: 'Validation failed.', errors: parsed.error.flatten() });
    }

    const projectZip = files?.projectZip?.[0];
    const thumbnailFile = files?.thumbnail?.[0];
    const demoVideoFile = files?.demoVideo?.[0];

    if (!projectZip || !thumbnailFile || !demoVideoFile) {
      await removeUploads();
      return res.status(400).json({ ok: false, message: 'A ZIP archive, thumbnail image, and demo video are all required.' });
    }

    const validZip = path.extname(projectZip.originalname).toLowerCase() === '.zip' &&
      ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(projectZip.mimetype) &&
      await hasZipLocalFileHeader(projectZip.path);
    if (!validZip) {
      await removeUploads();
      return res.status(400).json({ ok: false, message: 'The project source must be a .zip archive.' });
    }

    let sourceAnalysis;
    try {
      sourceAnalysis = await analyzeProjectArchive(projectZip.path);
    } catch (analysisError) {
      await removeUploads();
      return res.status(400).json({
        ok: false,
        message: analysisError instanceof Error ? analysisError.message : 'The project archive could not be reviewed.',
      });
    }

    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(thumbnailFile.originalname).toLowerCase()) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(thumbnailFile.mimetype)) {
      await removeUploads();
      return res.status(400).json({ ok: false, message: 'Thumbnail must be a PNG, JPEG, or WebP image.' });
    }

    if (!['.mp4', '.webm', '.mov'].includes(path.extname(demoVideoFile.originalname).toLowerCase()) ||
        !['video/mp4', 'video/webm', 'video/quicktime'].includes(demoVideoFile.mimetype)) {
      await removeUploads();
      return res.status(400).json({ ok: false, message: 'Demo video must be an MP4, WebM, or MOV file.' });
    }

    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!sellerProfile) {
      await removeUploads();
      return res.status(403).json({ ok: false, message: 'Seller profile not found.' });
    }

    const categoryName = parsed.data.category;
    const categorySlug = slugify(categoryName);

    const category = await prisma.projectCategory.upsert({
      where: { slug: categorySlug },
      update: { name: categoryName },
      create: {
        name: categoryName,
        slug: categorySlug,
      },
    });

    const techTags = [parsed.data.frontend, parsed.data.backend, parsed.data.database].filter(Boolean);
    const duplicateSourceCount = await prisma.project.count({
      where: { sourceFingerprint: sourceAnalysis.archiveFingerprint },
    });
    const project = await prisma.project.create({
      data: {
        title: parsed.data.title,
        slug: `${slugify(parsed.data.title)}-${Date.now()}`,
        shortDescription: parsed.data.description.slice(0, 180),
        fullDescription: parsed.data.description,
        categoryId: category.id,
        sellerId: sellerProfile.id,
        status: 'PENDING_APPROVAL',
        price: Math.round(Number(parsed.data.price) * 100),
        version: parsed.data.version,
        tags: JSON.stringify(techTags),
        sourceAnalysis: JSON.stringify(sourceAnalysis),
        sourceFingerprint: sourceAnalysis.archiveFingerprint,
        duplicateSourceCount,
        thumbnail: publicUploadUrl(thumbnailFile.filename),
        demoVideo: publicUploadUrl(demoVideoFile.filename),
        demoUrl: parsed.data.demoUrl || null,
        projectFiles: {
          create: {
            fileName: projectZip.originalname,
            storageKey: projectZip.path,
            mimeType: projectZip.mimetype,
            size: projectZip.size,
          },
        },
        approval: {
          create: { status: 'PENDING_REVIEW' },
        },
        versions: {
          create: { version: parsed.data.version, status: 'APPROVED' },
        },
      },
    });

    res.status(201).json({
      ok: true,
      message: 'Project submitted successfully and is awaiting approval.',
      data: {
        projectId: project.id,
        status: project.status,
      },
    });
  } catch (error) {
    await removeUploads();
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to save project submission.' });
  }
});

projectRoutes.post('/:id/comments', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  const parsed = z.object({ comment: z.string().trim().min(2).max(2000) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Enter a comment between 2 and 2,000 characters.' });
  }

  try {
    const project = await prisma.project.findFirst({ where: { id: String(req.params.id), status: 'APPROVED' } });
    if (!project) {
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }

    const comment = await prisma.projectComment.create({
      data: { projectId: project.id, userId: req.user!.id, comment: parsed.data.comment },
      include: { user: { select: { name: true } } },
    });
    return res.status(201).json({
      ok: true,
      data: { id: comment.id, comment: comment.comment, author: comment.user.name, createdAt: comment.createdAt },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to post comment.' });
  }
});

projectRoutes.post('/:id/customization-requests', authenticateJWT, requireRole(['BUYER']), async (req, res) => {
  const parsed = z.object({
    description: z.string().trim().min(20).max(5000),
    budget: z.string().trim().max(100).optional(),
    timeline: z.string().trim().max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: 'Describe the requested customization (20–5,000 characters).' });
  }

  try {
    const project = await prisma.project.findFirst({ where: { id: String(req.params.id), status: 'APPROVED' } });
    if (!project) {
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }

    const request = await prisma.projectCustomizationRequest.create({
      data: { ...parsed.data, projectId: project.id, userId: req.user!.id },
    });
    return res.status(201).json({ ok: true, data: { id: request.id, status: request.status } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to submit customization request.' });
  }
});
