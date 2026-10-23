import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(projectRoot, 'server');
const envPath = path.join(projectRoot, '.env');

try {
  process.loadEnvFile(envPath);
} catch (error) {
  console.error(`Unable to load local environment from ${envPath}.`, error);
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const child = spawn(process.execPath, [prismaCli, ...process.argv.slice(2)], {
    cwd: serverRoot,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error('Unable to start the local Prisma CLI.', error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
