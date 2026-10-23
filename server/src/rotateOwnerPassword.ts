import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDatabase, prisma } from './lib/prisma.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

async function rotateOwnerPassword() {
  const parsed = credentialsSchema.safeParse({
    email: process.env.CODEMARKET_OWNER_EMAIL,
    password: process.env.CODEMARKET_NEW_OWNER_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error('Provide CODEMARKET_OWNER_EMAIL and a new CODEMARKET_NEW_OWNER_PASSWORD of at least 12 characters.');
  }

  await connectDatabase();
  const email = parsed.data.email.toLowerCase();
  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
  if (!owner || owner.role !== 'ADMIN' || owner.status !== 'ACTIVE') {
    throw new Error('No active admin account exists for the supplied owner email; no account was changed.');
  }

  await prisma.user.update({
    where: { id: owner.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) },
  });
  console.info('Owner password rotated successfully. The password was not displayed or written to a file.');
}

rotateOwnerPassword()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Owner password rotation failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
