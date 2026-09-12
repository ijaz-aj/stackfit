import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load `.env.local` and `.env` for the tools that do not do it themselves.
 *
 * Next reads both automatically. The Prisma CLI reads only `.env`, and `tsx`
 * reads neither, so `DATABASE_URL` in `.env.local` gave a working dev server
 * and a `db:push` that failed with "DATABASE_URL is not set" while the variable
 * was sitting in a file two directories away. The error message even told you
 * to put it there. Three tools disagreeing about which file counts is not
 * something anyone should have to know.
 *
 * `.env.local` first because that is the Next precedence and the file people
 * actually edit; `process.loadEnvFile` does not overwrite a variable that is
 * already set, so a real environment variable still wins over both, which is
 * what a deployment relies on.
 *
 * Imported for its side effect, and it has to be. ES module imports are all
 * evaluated before any top-level statement in the importing file, so a
 * `loadEnvFiles()` call sitting above an `import { prisma }` line still runs
 * *after* that module has loaded. Doing the work at import time and putting
 * this first is the only ordering the language actually guarantees.
 */
function loadEnvFiles(): void {
  const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const name of ['.env.local', '.env']) {
    const file = join(appRoot, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

loadEnvFiles();
