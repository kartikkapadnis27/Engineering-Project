import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const environmentPath = path.join(projectRoot, '.env');
const result = dotenv.config({ path: environmentPath });

if (result.error && process.env.NODE_ENV === 'development') {
  console.warn(`Local environment file was not loaded from ${environmentPath}.`);
}
