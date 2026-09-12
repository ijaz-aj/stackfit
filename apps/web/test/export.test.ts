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

import { buildProposal, coverageDisclaimer, justifyBundle, runPipeline } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { engineData, today } from '../src/lib/config.server';
import { proposalToDocx } from '../src/lib/proposal-docx.server';
import { proposalToPdf } from '../src/lib/proposal-pdf.server';
import { proposalToXlsx } from '../src/lib/proposal-xlsx.server';
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
    justifications: justifyBundle(result.recommended, {
      scores: result.scores,
      candidates: result.candidates,
      productNames: new Map(
        result.products.map((entry) => [entry.id, { name: entry.name, vendor: entry.vendor }]),
      ),
    }),
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

  it('carries the coverage disclaimer, verbatim', async () => {
    // The other sentence that has to survive the export. A coverage percentage
    // is the number most likely to be misread — "PCI DSS 100% covered" invites
    // a reader to conclude the audit is handled — and no product satisfies a
    // control on its own.
    const document = documentFor();
    const body = await docxText(await proposalToDocx(document));

    expect(body).toContain(coverageDisclaimer());
    expect(body).toContain('not a compliance assessment');
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

/** Every `<si>` in the shared string table, in index order. */
async function sharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await zip.file('xl/sharedStrings.xml')!.async('string');
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map((match) =>
    [...match[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((run) => run[1]).join(''),
  );
}

describe('the XLSX cost model', () => {
  it('is a structurally valid workbook with the three sheets an analyst needs', async () => {
    const zip = await JSZip.loadAsync(await proposalToXlsx(documentFor()));
    const names = Object.keys(zip.files);

    for (const required of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/styles.xml',
    ]) {
      expect(names, `missing required part ${required}`).toContain(required);
    }

    const parser = new XMLParser({ ignoreAttributes: false });
    for (const name of names) {
      if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
      const content = await zip.file(name)!.async('string');
      expect(() => parser.parse(content), `${name} is not well-formed XML`).not.toThrow();
    }

    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    for (const sheet of ['Cost model', 'Roadmap', 'Assumptions']) {
      expect(workbook, `sheet "${sheet}" is missing`).toContain(`name="${sheet}"`);
    }
  });

  it('writes money as numbers, not as formatted text', async () => {
    // The whole reason this export exists separately from the DOCX. The client
    // gets prose with "$170,100" in it; the analyst gets a cell they can sum,
    // sort and pivot. A column of currency strings is a spreadsheet that cannot
    // be used as one.
    const document = documentFor();
    const zip = await JSZip.loadAsync(await proposalToXlsx(document));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');

    const rows = [...sheet.matchAll(/<row[^>]*>(.*?)<\/row>/gs)];
    expect(rows.length).toBe(document.costModel.length + 1);

    // A shared-string cell carries t="s"; a numeric one carries no type at all.
    // Every money column must be the latter.
    const numericCells = [...sheet.matchAll(/<c(?![^>]*\st="s")[^>]*>\s*<v>([^<]+)<\/v>/g)];
    expect(numericCells.length).toBeGreaterThan(document.costModel.length);

    // And no cell anywhere should contain a rendered currency string.
    const strings = await sharedStrings(zip);
    expect(strings.some((value) => /^[$€₹][\d,]/.test(value))).toBe(false);
  });

  it('carries the §6 rule 4 disclaimer on its own sheet', async () => {
    // A spreadsheet is the export most likely to be forwarded on its own with
    // no covering note, so the disclaimer cannot live only in the DOCX.
    const document = documentFor();
    const zip = await JSZip.loadAsync(await proposalToXlsx(document));
    const strings = await sharedStrings(zip);

    expect(strings).toContain(document.disclaimer);
    // And the coverage one. This is the sheet an analyst pastes into their own
    // model, so a percentage leaving here needs the caveat travelling with it.
    expect(strings).toContain(coverageDisclaimer());
  });

  it('carries every cost line separately, so a figure can be argued with', async () => {
    // Licence, support, infrastructure and people as four columns rather than
    // one total. An analyst who cannot see which line is wrong cannot correct
    // it, and the people line is the one most often disputed.
    const zip = await JSZip.loadAsync(await proposalToXlsx(documentFor()));
    const strings = await sharedStrings(zip);

    for (const heading of [
      'Licence /yr',
      'Support /yr',
      'Infrastructure /yr',
      'People /yr',
      'Ops FTE',
      'Pricing confidence',
      'Price age',
    ]) {
      expect(strings, `cost model is missing the "${heading}" column`).toContain(heading);
    }
  });

  it('reads the costing the selection was made on, discount included', async () => {
    // The Phase 4 finding-2 trap, in a new place: re-deriving a discounted
    // product's licence by id yields the undiscounted figure, and the
    // spreadsheet would then disagree with the proposal it came from.
    const document = documentFor();
    for (const row of document.costModel) {
      const lines =
        row.licenceAnnual.amountMinor +
        row.supportAnnual.amountMinor +
        row.infraAnnual.amountMinor;
      expect(lines, `${row.productName}: spend does not equal its own cost lines`).toBe(
        row.annualSpend.amountMinor,
      );
    }
  });
});

/**
 * Text out of a PDF, without a parser dependency.
 *
 * react-pdf writes its glyphs as hex strings inside TJ arrays — a line reads
 * `[<53> 0 <656375...> 20 ...] TJ` rather than `(Security...) Tj` — so the
 * naive "find the parenthesised strings" approach finds nothing at all and
 * would make these tests pass while proving nothing.
 *
 * The bytes are WinAnsi, not Latin-1, and the difference is only visible on
 * punctuation: an em-dash is 0x97 and a bullet 0x95, both of which Latin-1
 * decodes to control characters. Decoding wrongly made this harness report the
 * PDF as missing whole paragraphs that were in fact present.
 */
function pdfText(buffer: Buffer): string {
  const winAnsi = new TextDecoder('windows-1252');
  const parts: string[] = [];

  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let raw: Buffer;
    try {
      raw = inflateSync(Buffer.from(match[1]!, 'latin1'));
    } catch {
      continue;
    }
    for (const array of raw.toString('latin1').matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const chunk = [...array[1]!.matchAll(/<([0-9A-Fa-f]*)>/g)]
        .map((hex) => winAnsi.decode(Buffer.from(hex[1]!, 'hex')))
        .join('');
      if (chunk.length > 0) parts.push(chunk);
    }
  }

  return parts.join('\n');
}

describe('the PDF export', () => {
  it('is a structurally valid PDF', async () => {
    const buffer = await proposalToPdf(documentFor());
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1')).toContain('%%EOF');
    expect(buffer.byteLength).toBeGreaterThan(4_000);
  });

  it('carries the §6 rule 4 disclaimer, verbatim', async () => {
    const document = documentFor();
    const body = pdfText(await proposalToPdf(document));

    // Whitespace in a PDF is a layout instruction, not content, so the
    // comparison is on the words rather than the spacing between them.
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).toContain(document.disclaimer.replace(/\s+/g, ' '));
  });

  it('carries the coverage disclaimer, verbatim', async () => {
    const body = pdfText(await proposalToPdf(documentFor()));
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).toContain(coverageDisclaimer().replace(/\s+/g, ' '));
  });

  it('writes every section of the document model into the file', async () => {
    const document = documentFor();
    const flat = pdfText(await proposalToPdf(document)).replace(/\s+/g, ' ');

    for (const section of document.sections) {
      expect(flat, `section "${section.heading}" did not reach the PDF`).toContain(
        section.heading,
      );
    }
    expect(flat).toContain(document.title);
  });

  it('says the same thing as the DOCX', async () => {
    // The reason the document model exists. Two renderers, one set of content
    // decisions — so a client reading the PDF and a client reading the Word
    // file must not be reading different proposals.
    const document = documentFor();
    const [pdf, docx] = await Promise.all([
      proposalToPdf(document),
      proposalToDocx(document),
    ]);

    const inPdf = pdfText(pdf).replace(/\s+/g, ' ');
    const inDocx = (await docxText(docx)).replace(/\s+/g, ' ');

    // Every paragraph and bullet of the model, in both.
    const prose = document.sections
      .flatMap((section) => section.blocks)
      .flatMap((block) => {
        if (block.kind === 'paragraph' || block.kind === 'callout') return [block.text];
        if (block.kind === 'bullets') return [...block.items];
        return [];
      })
      .map((line) => line.replace(/\s+/g, ' '));

    for (const line of prose) {
      expect(inPdf, `PDF is missing: ${line.slice(0, 60)}…`).toContain(line);
      expect(inDocx, `DOCX is missing: ${line.slice(0, 60)}…`).toContain(line);
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
