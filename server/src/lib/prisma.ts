import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

// MongoDB साठी सरळ आणि सोपा क्लायंट इनिशियलाइज करा (कोणताही SQLite चेक न ठेवता)
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export default prisma;
