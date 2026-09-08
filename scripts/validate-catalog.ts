/**
 * `pnpm catalog:validate` — Zod-validate every YAML file under data/.
 *
 * Phase 0 stub: the data/ tree and the schemas it validates against arrive in
 * Phase 1. Until then this reports that there is nothing to check and exits 0,
 * so the command exists and CI-less checks can call it unconditionally.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'data');

function main(): void {
  if (!existsSync(DATA_DIR) || readdirSync(DATA_DIR).length === 0) {
    console.log('catalog:validate — no data/ catalog files yet (added in Phase 1). Nothing to do.');
    return;
  }

  console.error(
    'catalog:validate — data/ exists but the validator is not implemented yet (Phase 1).',
  );
  process.exitCode = 1;
}

main();
