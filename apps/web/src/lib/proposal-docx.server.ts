import type { ProposalBlock, ProposalDocument } from '@stackfit/engine';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import { renderCell } from './proposal.server';

/**
 * §8's proposal as a DOCX. Phase 8's definition of done is "proposal opens
 * cleanly in Word", which is why this is the export that matters most.
 *
 * It walks the same document model the HTML preview does, through the same
 * `renderCell`, so the file a client opens says what the analyst read on
 * screen. Nothing here decides content; if a section is missing from the
 * document it is missing from the model, not from this renderer.
 *
 * Deliberately conservative Word: built-in heading styles, a plain grid table,
 * no theming. A proposal that arrives with a broken style sheet or an
 * unsupported feature is worse than a plain one, and the client will very
 * likely edit it before it goes further.
 */

const ACCENT = '1F3A5F';
const MUTED = '4A5568';
const WARNING = '8A5A00';

function tableFrom(block: Extract<ProposalBlock, { kind: 'table' }>): Table {
  const header = new TableRow({
    tableHeader: true,
    children: block.columns.map(
      (column) =>
        new TableCell({
          shading: { fill: 'F1F3F5' },
          children: [
            new Paragraph({
              alignment: column.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: column.heading, bold: true, size: 18 })],
            }),
          ],
        }),
    ),
  });

  const body = block.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, index) =>
            new TableCell({
              children: [
                new Paragraph({
                  alignment:
                    block.columns[index]?.align === 'right'
                      ? AlignmentType.RIGHT
                      : AlignmentType.LEFT,
                  children: [new TextRun({ text: renderCell(cell), size: 18 })],
                }),
              ],
            }),
        ),
      }),
  );

  const total =
    block.total === undefined
      ? []
      : [
          new TableRow({
            children: block.total.map(
              (cell, index) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment:
                        block.columns[index]?.align === 'right'
                          ? AlignmentType.RIGHT
                          : AlignmentType.LEFT,
                      children: [new TextRun({ text: renderCell(cell), bold: true, size: 18 })],
                    }),
                  ],
                }),
            ),
          }),
        ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body, ...total],
  });
}

function blockToDocx(block: ProposalBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'paragraph':
      return [
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: block.text, size: 20 })],
        }),
      ];

    case 'bullets':
      return block.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [new TextRun({ text: item, size: 20 })],
          }),
      );

    case 'callout':
      // A left rule and a tint rather than a text box: Word handles paragraph
      // borders everywhere, and a floating box is the first thing to break when
      // somebody edits the document.
      return [
        new Paragraph({
          spacing: { before: 160, after: 160 },
          shading: { fill: block.tone === 'warning' ? 'FFF6E5' : 'F5F6F7' },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 18,
              space: 8,
              color: block.tone === 'warning' ? WARNING : MUTED,
            },
          },
          children: [
            new TextRun({
              text: block.text,
              size: 18,
              color: block.tone === 'warning' ? WARNING : MUTED,
            }),
          ],
        }),
      ];

    case 'table':
      return [
        tableFrom(block),
        // Word runs tables into whatever follows without one.
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
  }
}

export async function proposalToDocx(document: ProposalDocument): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: document.title, bold: true, color: ACCENT })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Prepared for ${document.preparedFor}  ·  ${document.asOf}`,
          size: 20,
          color: MUTED,
        }),
      ],
    }),
  ];

  for (const section of document.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 80 },
        children: [new TextRun({ text: section.heading, bold: true, color: ACCENT })],
      }),
    );
    for (const block of section.blocks) children.push(...blockToDocx(block));
  }

  // ⚠ The document's Created and Modified dates cannot be set. docx 9.7.1
  // hard-codes `new Date()` inside its TimestampElement and exposes no option
  // for it — `created`/`modified` are not even in IPropertiesOptions — so
  // docProps/core.xml always carries the moment the file was generated rather
  // than the day the figures were priced.
  //
  // It only affects Word's File → Info panel, and the date that matters is on
  // the first page and in the disclaimer, where a reader will actually see it.
  // Recorded here because it is also the one thing that stops two exports of
  // the same scenario being identical, and the export test excludes core.xml
  // for this reason rather than by oversight.
  const file = new Document({
    creator: 'StackFit',
    title: `${document.title} — ${document.preparedFor}`,
    description: document.disclaimer,
    sections: [{ children }],
  });

  return Packer.toBuffer(file);
}
