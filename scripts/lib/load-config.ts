/**
 * Loads and validates files from data/config/.
 *
 * This is the boundary the engine deliberately does not cross: the engine takes
 * assumptions as an argument, and something outside it — this loader, and later
 * the web app — is responsible for reading and validating the YAML.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SizingAssumptions } from '@stackfit/schema';
import { parse as parseYaml } from 'yaml';

export function loadSizingAssumptions(dataDir: string): SizingAssumptions {
  const file = join(dataDir, 'config', 'sizing-assumptions.yaml');
  return SizingAssumptions.parse(parseYaml(readFileSync(file, 'utf8')));
}
