import {
  coverageDisclaimer,
  type CostModelRow,
  type ProposalDocument,
  type RoadmapEntry,
} from '@stackfit/engine';
import { CURRENCY_MINOR_UNIT_EXPONENT, type CurrencyCode, type Money } from '@stackfit/schema';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/node';

/**
 * §8's "raw XLSX of the cost model for the analyst".
 *
 * The distinction from the DOCX is the whole point. The DOCX is prose for a
 * client and every figure in it is a formatted string. This is a spreadsheet
 * for an analyst, so money is written as a *number* with a currency format —
 * the sheet exists to be sorted, summed and pivoted, and a column of text
 * cannot be.
 *
 * That is also why money is divided by its minor-unit exponent exactly once,
 * here. It is the same render boundary the other exports cross (hard rule 1);
 * it just happens to land on a number rather than a string.
 */

const HEADER = { fontWeight: 'bold', backgroundColor: '#F1F3F5' } as const;

/** Excel number formats. `#,##0` keeps whole currency units without cents. */
function currencyFormat(currency: CurrencyCode): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹';
  return `"${symbol}"#,##0`;
}

function amount(money: Money) {
  return money.amountMinor / 10 ** CURRENCY_MINOR_UNIT_EXPONENT[money.currency];
}

function moneyCell(money: Money) {
  return { type: Number, value: amount(money), format: currencyFormat(money.currency) } as const;
}

function headerRow(headings: readonly string[]): Row {
  return headings.map((heading) => ({ value: heading, type: String, ...HEADER })) as Row;
}

function costModelSheet(rows: readonly CostModelRow[]): SheetData {
  const body = rows.map(
    (row): Row =>
      [
        { type: String, value: row.categoryLabel },
        { type: String, value: row.productName },
        { type: String, value: row.vendor },
        { type: String, value: row.tierName },
        { type: String, value: row.mandatory ? 'Compliance' : 'Risk' },
        { type: Number, value: row.fitScore, format: '0.0' },
        moneyCell(row.licenceAnnual),
        moneyCell(row.supportAnnual),
        moneyCell(row.infraAnnual),
        moneyCell(row.opsFteAnnual),
        { type: Number, value: row.opsFte, format: '0.00' },
        moneyCell(row.annualSpend),
        moneyCell(row.annualRecurring),
        moneyCell(row.oneTime),
        moneyCell(row.tco),
        { type: String, value: row.pricingConfidence },
        { type: String, value: row.priceAge },
        { type: String, value: row.suiteDiscountApplied ? 'yes' : 'no' },
      ] as Row,
  );

  return [
    headerRow([
      'Category',
      'Product',
      'Vendor',
      'Tier',
      'Driver',
      'Fit',
      'Licence /yr',
      'Support /yr',
      'Infrastructure /yr',
      'People /yr',
      'Ops FTE',
      'Annual spend',
      'Total annual',
      'One-time',
      'TCO',
      'Pricing confidence',
      'Price age',
      'Suite discount',
    ]),
    ...body,
  ];
}

function roadmapSheet(entries: readonly RoadmapEntry[]): SheetData {
  const body = entries.map(
    (entry): Row =>
      [
        { type: String, value: entry.phaseLabel },
        { type: String, value: entry.horizon },
        { type: String, value: entry.categoryLabel },
        { type: String, value: entry.productName },
        { type: String, value: entry.tierName },
        { type: String, value: entry.mandatory ? 'Compliance' : 'Risk' },
        { type: Number, value: entry.typicalWeeks, format: '0' },
        moneyCell(entry.annualSpend),
        moneyCell(entry.oneTime),
      ] as Row,
  );

  return [
    headerRow([
      'Phase',
      'Horizon',
      'Category',
      'Product',
      'Tier',
      'Driver',
      'Typical weeks',
      'Annual spend',
      'One-time',
    ]),
    ...body,
  ];
}

/**
 * §6 rule 4 applies to every export, and a spreadsheet is the one most likely
 * to be forwarded on its own with no covering note. It gets its own sheet
 * rather than a footnote in a corner of another one.
 */
function assumptionsSheet(document: ProposalDocument): SheetData {
  return [
    headerRow(['Assumptions and disclaimers']),
    [{ type: String, value: document.disclaimer }] as Row,
    // Verbatim here too: this sheet is where an analyst pastes figures into
    // their own model, and a coverage percentage travels further than the page
    // that qualified it.
    [{ type: String, value: coverageDisclaimer() }] as Row,
    [] as Row,
    [{ type: String, value: `Prepared for: ${document.preparedFor}` }] as Row,
    [{ type: String, value: `Figures priced as of: ${document.asOf}` }] as Row,
    [{ type: String, value: `Currency: ${document.currency}` }] as Row,
    [] as Row,
    [
      {
        type: String,
        value:
          'Operational FTE is an analyst estimate throughout, not a vendor figure. It is the ' +
          'cost most often left out of a comparison and the one that most changes the answer ' +
          'between commercial and open-source options. It covers administering each tool and ' +
          'excludes staffing continuous monitoring, which is a larger and separate question.',
      },
    ] as Row,
    [
      {
        type: String,
        value:
          'Any row whose pricing confidence is not "public_list" is priced on a reported rate ' +
          'rather than a vendor-published one. Obtain a quote before treating it as budget.',
      },
    ] as Row,
  ];
}

export async function proposalToXlsx(document: ProposalDocument): Promise<Buffer> {
  return writeXlsxFile([
    // The header row is frozen on the two data sheets: an analyst scrolling a
    // thirteen-row cost model past the headings is the first thing that makes a
    // spreadsheet annoying to use.
    { sheet: 'Cost model', data: costModelSheet(document.costModel), stickyRowsCount: 1 },
    { sheet: 'Roadmap', data: roadmapSheet(document.roadmap), stickyRowsCount: 1 },
    { sheet: 'Assumptions', data: assumptionsSheet(document) },
  ]).toBuffer();
}
