// The framework library, checked as a whole.
//
// Framework files are the authority for what a control id means, and a bundle's
// coverage percentage is computed against them. That makes their *shape* worth
// asserting: a missing framework silently drops a client's obligations, and an
// over-broad `satisfiedBy` silently inflates every bundle's score.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Framework, FrameworkId, ProductCategory } from '@stackfit/schema';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

const FRAMEWORKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'frameworks');

const frameworks = readdirSync(FRAMEWORKS_DIR)
  .filter((name) => name.endsWith('.yaml'))
  .sort()
  .map((name) => Framework.parse(parseYaml(readFileSync(join(FRAMEWORKS_DIR, name), 'utf8'))));

describe('framework coverage of PROJECT_SPEC §5.4', () => {
  it('ships every framework the analyst can tick during intake', () => {
    // If FrameworkId offers it in the wizard, data/frameworks must define it —
    // otherwise ticking it would silently contribute nothing to the coverage
    // matrix rather than failing loudly.
    expect(frameworks.map((framework) => framework.id).sort()).toEqual([...FrameworkId.options].sort());
  });

  it('gives every framework at least one source', () => {
    for (const framework of frameworks) {
      expect(framework.sources.length).toBeGreaterThan(0);
    }
  });

  it('declares how well-sourced each framework is', () => {
    expect(
      Object.fromEntries(frameworks.map((framework) => [framework.id, framework.sourceQuality])),
    ).toMatchInlineSnapshot(`
      {
        "cert-in": "provisional",
        "cis-v8": "publisher_verified",
        "dpdp-2023": "secondary_sources",
        "gdpr": "secondary_sources",
        "hipaa": "secondary_sources",
        "iso-27001-2022": "secondary_sources",
        "nis2": "secondary_sources",
        "nist-csf-2.0": "secondary_sources",
        "pci-dss-4.0": "secondary_sources",
        "rbi-csf": "provisional",
        "soc-2": "secondary_sources",
      }
    `);
  });

  it('explains itself wherever the sourcing is less than publisher-verified', () => {
    // A weaker source has to say why, in the file, where whoever relies on it
    // will see it.
    for (const framework of frameworks) {
      if (framework.sourceQuality === 'publisher_verified') continue;
      expect(framework.notes, `${framework.id} has no note explaining its sourceQuality`).toBeDefined();
      expect(framework.notes).toContain('sourceQuality');
    }
  });
});

describe('control mappings', () => {
  it('only maps controls to product categories the catalog knows about', () => {
    const known = new Set<string>(ProductCategory.options);
    for (const framework of frameworks) {
      for (const control of framework.controls) {
        for (const category of control.satisfiedBy) {
          expect(known.has(category), `${framework.id}:${control.id} → ${category}`).toBe(true);
        }
      }
    }
  });

  it('keeps no single framework over-broad', () => {
    // The guard against coverage inflation, applied per file. A library-wide
    // average is the wrong instrument: inflation happens in one file, and ten
    // conservative files will hide it.
    //
    // The bar sits above RBI CSF (77%), the densest honest file here. Frameworks
    // written for practitioners — RBI, CIS, PCI DSS — are largely lists of
    // technical controls, and a high rate in those is correct rather than
    // generous. What no honest file should do is claim a product for nearly
    // everything it lists.
    for (const framework of frameworks) {
      const mapped = framework.controls.filter((control) => control.satisfiedBy.length > 0).length;
      const total = framework.controls.length;
      expect(mapped / total, `${framework.id} maps ${mapped}/${total} controls`).toBeLessThan(0.85);
    }
  });

  it('keeps the broad standards mostly unmapped — they are governance, people and process', () => {
    // ISO 27001 Annex A, the HIPAA Security Rule and the SOC 2 TSC each publish a
    // full-length control list spanning governance, people and physical security.
    // Most of it is not closed by a purchase, and if one of these ever flips,
    // someone has been generous with satisfiedBy.
    //
    // Deliberately not applied library-wide. GDPR and NIS2 are scoped to their
    // security articles, so their denominator was filtered on purpose and a high
    // rate there means nothing.
    for (const id of ['iso-27001-2022', 'hipaa', 'soc-2']) {
      const framework = frameworks.find((candidate) => candidate.id === id);
      expect(framework, `${id} is missing`).toBeDefined();
      const mapped = framework!.controls.filter((control) => control.satisfiedBy.length > 0);
      expect(mapped.length, `${id} maps a majority of its controls`).toBeLessThan(
        framework!.controls.length / 2,
      );
    }
  });

  it('marks nothing mandatory in the voluntary frameworks', () => {
    // NIST CSF, CIS and SOC 2 prescribe no control list, and ISO 27001 scope is
    // set by the organisation's Statement of Applicability. None of them can
    // compel a purchase, and saying otherwise would misrepresent them.
    const voluntary = ['nist-csf-2.0', 'cis-v8', 'soc-2', 'iso-27001-2022'];
    for (const framework of frameworks.filter((candidate) => voluntary.includes(candidate.id))) {
      const mandatory = framework.controls.filter((control) => control.mandatory);
      expect(mandatory, `${framework.id} marks controls mandatory`).toEqual([]);
    }
  });

  it('marks something mandatory in every binding framework', () => {
    // The converse: a framework that is law or contract must promote at least
    // one category, or ticking it in the wizard would change nothing.
    const binding = ['pci-dss-4.0', 'hipaa', 'gdpr', 'nis2', 'cert-in', 'rbi-csf', 'dpdp-2023'];
    for (const framework of frameworks.filter((candidate) => binding.includes(candidate.id))) {
      const mandatory = framework.controls.filter((control) => control.mandatory);
      expect(mandatory.length, `${framework.id} marks nothing mandatory`).toBeGreaterThan(0);
    }
  });
});

describe('the library is big enough to be useful', () => {
  it('carries a substantial control library', () => {
    const total = frameworks.reduce((count, framework) => count + framework.controls.length, 0);
    expect(total).toBeGreaterThan(200);
  });

  it('lists all 93 ISO 27001:2022 Annex A controls, not just the technological ones', () => {
    // Coverage is a percentage. Omitting the governance and people controls
    // would shrink the denominator and make every bundle look better against
    // ISO than it is.
    const iso = frameworks.find((framework) => framework.id === 'iso-27001-2022');
    expect(iso?.controls).toHaveLength(93);
  });
});
