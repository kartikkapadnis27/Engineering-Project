import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDatabase, prisma } from './lib/prisma.js';

const ownerCredentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(100).default('Marketplace Owner'),
});

async function seedOwner() {
  const parsed = ownerCredentialsSchema.safeParse({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
    name: process.env.OWNER_NAME,
  });
  if (!parsed.success) {
    throw new Error('Set a valid OWNER_EMAIL and an OWNER_PASSWORD of at least 8 characters in the project root .env.');
  }

  await connectDatabase();
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  if (existing && existing.role !== 'ADMIN') {
    throw new Error('This email belongs to a non-admin account. No account changes were made.');
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: parsed.data.name, passwordHash },
    });
    console.info(`Owner account credentials synchronized for ${email}. The existing account status was preserved.`);
    return;
  }

  await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash, role: 'ADMIN', status: 'ACTIVE' },
  });
  console.info(`Owner account created for ${email}. The password is stored as a bcrypt hash.`);
}

seedOwner()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Owner account provisioning failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
