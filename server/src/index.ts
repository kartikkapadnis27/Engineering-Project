import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma, connectDatabase } from './lib/prisma.js';
import { authRoutes } from './routes/authRoutes.js'; 

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// मुख्य बॅकएंड रोटेशन्स जोडले
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// फ्रंटएंड डिस्ट फाइल्स राऊटिंग सेटअप
const __root_filename = fileURLToPath(import.meta.url);
const __root_dirname = path.dirname(__root_filename);
const clientDistPath = path.resolve('/app/client/dist');

app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`CodeMarket Platform actively running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Database connection failed, server exiting:', error);
    process.exit(1);
  }
};

startServer();
