import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
const envPath = path.join(projectRoot, '.env');

try {
  process.loadEnvFile(envPath);
} catch (error) {
  console.error(`Unable to load the project root .env file from ${envPath}.`, error);
  process.exitCode = 1;
}

if (process.exitCode !== 1 && !npmCli) {
  console.error('Run this launcher through npm run dev so npm can locate its CLI.');
  process.exitCode = 1;
} else if (process.exitCode !== 1) {
  const children = [];
  let shuttingDown = false;

  const stopChildren = () => {
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', stopChildren);
  process.on('SIGTERM', stopChildren);

  for (const [name, folder] of [['API', 'server'], ['Client', 'client']]) {
    const child = spawn(process.execPath, [npmCli, 'run', 'dev'], {
      cwd: path.join(projectRoot, folder),
      env: process.env,
      stdio: 'inherit',
    });
    children.push(child);
    child.on('error', (error) => {
      console.error(`${name} development process failed to start.`, error);
      stopChildren();
      process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
      if (!shuttingDown && code !== 0) {
        console.error(`${name} development process exited unexpectedly (${signal ?? code}).`);
        stopChildren();
        process.exitCode = code ?? 1;
      }
    });
  }
}
