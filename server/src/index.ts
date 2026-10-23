import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma, connectDatabase } from './lib/prisma.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware Setup
app.use(cors());
app.use(express.json());

// API Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected', timestamp: new Date() });
});

// ==========================================
// फ्रंटएंड रिऍक्ट (Vite Dist) अचूक राऊटिंग जोडणी
// ==========================================
const __root_filename = fileURLToPath(import.meta.url);
const __root_dirname = path.dirname(__root_filename);

// डॉकर कंटेनरमध्ये सर्व फाइल्स /app मध्ये असतात, म्हणून थेट /app/client/dist वापरा
const clientDistPath = path.resolve('/app/client/dist');

// एक्सप्रेसला फ्रंटएंडच्या सर्व स्टॅटिक फाइल्स वाचायला सांगा
app.use(express.static(clientDistPath));

// जर कोणतीही दुसरी लिंक (Route) मागितली, तर फ्रंटएंडची index.html फाईल दाखवा
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// सर्व्हर सुरू करण्याची मुख्य लॉजिक
const startServer = async () => {
  try {
    // डेटाबेस कनेक्शन तपासा
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
