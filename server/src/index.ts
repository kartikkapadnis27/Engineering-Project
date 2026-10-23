import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma, connectDatabase } from './lib/prisma.js';

// थेट Named Import चा वापर करा जेणेकरून टाईपस्क्रिप्ट कोणतीही त्रुटी दाखवणार नाही
import { authRoutes } from './routes/authRoutes.js'; 

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware Setup
app.use(cors());
app.use(express.json());

// ==========================================
// बॅकएंड एपीआय रोटेशन्स (API Routes)
// ==========================================
app.use('/api/auth', authRoutes);

// API Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected', timestamp: new Date() });
});

// ==========================================
// फ्रंटएंड रिऍक्ट (Vite Dist) स्टॅटिक फाईल राऊटिंग
// ==========================================
const __root_filename = fileURLToPath(import.meta.url);
const __root_dirname = path.dirname(__root_filename);
const clientDistPath = path.resolve('/app/client/dist');

// एक्सप्रेसला फ्रंटएंडच्या सर्व स्टॅटिक फाइल्स वाचायला सांगा
app.use(express.static(clientDistPath));

// फ्रंटएंडची index.html फाईल दाखवा
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// सर्व्हर सुरू करण्याची मुख्य लॉजिक
const startServer = async () => {
  try {
    await connectDatabase();
    
    app.listen(PORT, () => {
      console.log(`Successfully connected to MongoDB via Prisma!`);
      console.log(`CodeMarket API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start CodeMarket server:', error);
    process.exit(1);
  }
};

startServer();
