// Phase 8's definition of done is "proposal opens cleanly in Word".
//
// A DOCX is a zip of XML parts, and Word reports the whole file as corrupt if
// any one of them is malformed — so "opens cleanly" is checkable here rather
// than only by opening Word. These tests unzip the generated file, parse every
// XML part, and read the text back out.
//
// They also pin the thing that must never go missing: PROJECT_SPEC §6 rule 4
// requires every export to carry the disclaimer, and an export is exactly where
// a client stops seeing the badges the dashboard shows them.

import { buildProposal, runPipeline } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { engineData, today } from '../src/lib/config.server';
import { proposalToDocx } from '../src/lib/proposal-docx.server';
import { proposalFilename } from '../src/lib/proposal.server';
import { NEW_INVENTORY, NEW_PROFILE } from '../src/lib/scenario';

const data = engineData();
const AS_OF = '2026-09-12';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

const profile: ClientProfile = {
  ...NEW_PROFILE,
  orgName: 'Acme Health',
  industry: 'healthcare',
  employeeCount: 300,
  itStaffCount: 8,
  securityStaffFte: 1,
  compliance: ['hipaa'],
  budget: { annualCap: usd(60_000_00), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
};

const inventory = {
  ...NEW_INVENTORY,
  windowsEndpoints: { count: 220 },
  windowsServers: { count: 30 },
  m365Seats: { count: 300 },
  privilegedAccounts: { count: 12 },
};

function documentFor() {
  const result = runPipeline({
    profile,
    inventory,
    products: data.catalog,
    frameworks: data.frameworks,
    sizingAssumptions: data.sizingAssumptions,
    categoryWeights: data.categoryWeights,
    scoringWeights: data.scoringWeights,
    portfolioAssumptions: data.portfolioAssumptions,
    coverageAssumptions: data.coverageAssumptions,
    mssp: data.mssp,
    costInputs: { ...data.costInputsWithoutDate, today: today() },
  });

  return buildProposal({
    profile,
    sizing: result.sizing,
    products: result.products,
    recommended: result.recommended,
    essential: result.essential,
    ideal: result.ideal,
    coverage: result.coverage,
    assumptions: data.portfolioAssumptions,
    // Pinned rather than read from a clock, so the assertions below do not
    // start failing tomorrow for a reason that has nothing to do with the code.
    asOf: AS_OF,
  });
}

/** Every run of text in word/document.xml, in order. */
async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('\n');
}

describe('the DOCX export', () => {
  it('is a structurally valid OOXML package', async () => {
    // Word does not degrade gracefully: one malformed part and the whole file
    // is reported as corrupt, which is the failure this test exists to catch.
    const zip = await JSZip.loadAsync(await proposalToDocx(documentFor()));
    const names = Object.keys(zip.files);

    for (const required of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
    ]) {
      expect(names, `missing required OOXML part ${required}`).toContain(required);
    }

    const parser = new XMLParser({ ignoreAttributes: false });
    for (const name of names) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
      const content = await zip.file(name)!.async('string');
      expect(() => parser.parse(content), `${name} is not well-formed XML`).not.toThrow();
    }
  });

  it('carries the §6 rule 4 disclaimer, verbatim', async () => {
    // The one sentence that stops a budgetary estimate being read as a quote.
    // An export is where the client stops seeing the dashboard's badges, so
    // this is the last thing standing between an estimate and a commitment.
    const document = documentFor();
    const body = await docxText(await proposalToDocx(document));

    expect(body).toContain(
      'Indicative budgetary estimates based on published list pricing as of 2026-09-12. ' +
        'Not a quote. Actual pricing subject to vendor negotiation, channel discount, and bundling.',
    );
    expect(body).toContain(document.disclaimer);
  });

  it('writes every section of the document model into the file', async () => {
    // If a section is missing from the DOCX it must be missing from the model,
    // not lost by the renderer — otherwise the file a client opens and the page
    // the analyst read are different documents.
    const document = documentFor();
    const body = await docxText(await proposalToDocx(document));

    for (const section of document.sections) {
      expect(body, `section "${section.heading}" did not reach the DOCX`).toContain(
        section.heading,
      );
    }
    expect(body).toContain(document.title);
    expect(body).toContain(document.preparedFor);
  });

  it('renders money as formatted text, never as raw minor units', async () => {
    // Hard rule 1's render boundary, checked at the far end of it: 17010000
    // appearing in a client document instead of $170,100 is the failure mode.
    const body = await docxText(await proposalToDocx(documentFor()));
    expect(body).toMatch(/\$[\d,]+/);
    expect(body).not.toMatch(/\b\d{7,}\b/);
  });

  it('has identical content for the same scenario twice', async () => {
    // Content, not bytes, and the exclusion below is honest rather than
    // convenient. Two things in a DOCX are stamped with the wall clock and
    // neither is reachable: JSZip dates every zip entry, and docx 9.7.1
    // hard-codes `new Date()` in its timestamp element with no option to
    // override, so docProps/core.xml carries the generation time.
    //
    // Everything that says anything — the document body, the styles, the
    // relationships — is stable, and that is what is asserted: two exports of
    // one scenario say the same thing.
    const document = documentFor();
    const [first, second] = await Promise.all([
      proposalToDocx(document),
      proposalToDocx(document),
    ]);

    const [a, b] = await Promise.all([JSZip.loadAsync(first), JSZip.loadAsync(second)]);
    expect(Object.keys(a.files)).toEqual(Object.keys(b.files));

    for (const name of Object.keys(a.files)) {
      if (a.files[name]?.dir === true) continue;
      // Generation-time metadata, not content. See the note above.
      if (name === 'docProps/core.xml') continue;
      const [left, right] = await Promise.all([
        a.file(name)!.async('string'),
        b.file(name)!.async('string'),
      ]);
      expect(left, `${name} differs between two exports of the same scenario`).toBe(right);
    }
  });
});

describe('the download filename', () => {
  it('names the client and the date the figures were priced', () => {
    const document = documentFor();
    expect(proposalFilename(document, 'docx')).toBe(
      'acme-health-security-proposal-2026-09-12.docx',
    );
  });

  it('survives an organisation name that is not filename-safe', () => {
    const document = { ...documentFor(), preparedFor: 'Hospital, 300 beds / North' };
    expect(proposalFilename(document, 'docx')).toBe(
      'hospital-300-beds-north-security-proposal-2026-09-12.docx',
    );
  });
});
