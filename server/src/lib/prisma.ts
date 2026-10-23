import '../config/environment.js';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Configure a SQLite file URL in the project root .env.');
}

if (!/^file:/i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must be a SQLite file URL such as file:./dev.db.');
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  await prisma.$connect();
}
