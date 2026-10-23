import './config/environment.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/authRoutes.js';
import { projectRoutes } from './routes/projectRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { customRequestRoutes } from './routes/customRequestRoutes.js';
import { featureRoutes } from './routes/featureRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import { institutionRoutes } from './routes/institutionRoutes.js';
import { connectDatabase, prisma } from './lib/prisma.js';
import { ensureUploadDirectory } from './utils/fileStorage.js';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

if (process.env.NODE_ENV === 'production' &&
    (!process.env.SERVER_PUBLIC_URL || !process.env.SERVER_PUBLIC_URL.startsWith('https://'))) {
  throw new Error('SERVER_PUBLIC_URL must be configured as the public HTTPS origin in production.');
}

const app = express();
const port = Number(process.env.PORT ?? 4000);
const serveClient = process.env.SERVE_CLIENT === 'true';
const clientBuildPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? new URL(process.env.SERVER_PUBLIC_URL!).origin : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads/public', express.static(ensureUploadDirectory('public'), {
  fallthrough: false,
  index: false,
  dotfiles: 'deny',
}));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.user.count();
    res.json({ ok: true, message: 'CodeMarket API and database are ready.' });
  } catch {
    res.status(503).json({ ok: false, message: 'Database is unavailable.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', featureRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/custom-requests', customRequestRoutes);

if (serveClient) {
  app.use(express.static(clientBuildPath, { index: false, dotfiles: 'deny' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ ok: false, message: status === 413 ? 'An uploaded file exceeds the 200 MB limit.' : 'Unexpected or invalid uploaded file.' });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  res.status(500).json({ ok: false, message });
});

async function startServer() {
  try {
    await connectDatabase();
    app.listen(port, () => {
      console.log(`CodeMarket API listening on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to connect to the configured database. Check DATABASE_URL and database availability.');
    if (error instanceof Error) {
      console.error(`${error.name}: ${error.message}`);
    }
    process.exitCode = 1;
    await prisma.$disconnect();
  }
}

void startServer();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// एक्सप्रेसला फ्रंटएंडचे dist फोल्डर वाचायला सांगा
const clientDistPath = path.join(__dirname, '../../../client/dist');
app.use(express.static(clientDistPath));

// सर्व रोटेशन्स फ्रंटएंडच्या index.html कडे वळवा
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});
