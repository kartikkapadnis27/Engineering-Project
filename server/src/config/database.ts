import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('Successfully connected to MongoDB via Prisma!');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};
