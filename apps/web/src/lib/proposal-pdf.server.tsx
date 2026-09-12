import type { ProposalBlock, ProposalDocument, ProposalSection } from '@stackfit/engine';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { renderCell } from './proposal.server';

/**
 * §8's proposal as a PDF, the format PROJECT_SPEC §3 names alongside the DOCX.
 *
 * Third renderer over the same document model, through the same `renderCell`.
 * It decides nothing about content — if a section is missing here it is missing
 * from the model — which is the reason the model exists at all.
 *
 * react-pdf has its own component tree and its own flexbox-only layout, so this
 * cannot share JSX with the HTML preview. What it can share, and does, is every
 * word and every number.
 */

const INK = '#1a1a1a';
const MUTED = '#555f6b';
const RULE = '#c9cfd6';
const ACCENT = '#1f3a5f';
const WARNING_BG = '#fff6e5';
const WARNING_INK = '#8a5a00';
const NOTE_BG = '#f5f6f7';

const styles = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 54, paddingHorizontal: 46, fontSize: 9, color: INK },
  title: { fontSize: 18, color: ACCENT, fontWeight: 'bold' },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 4 },
  titleRule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 10, marginBottom: 4 },
  heading: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: 'bold',
    marginTop: 18,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  paragraph: { marginTop: 6, lineHeight: 1.5, color: '#2c3540' },
  bulletRow: { flexDirection: 'row', marginTop: 3 },
  bulletMark: { width: 10, color: MUTED },
  bulletText: { flex: 1, lineHeight: 1.5, color: '#2c3540' },
  callout: { marginTop: 8, padding: 7, borderLeftWidth: 2, lineHeight: 1.45, fontSize: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e6ea' },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE },
  totalRow: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: RULE },
  cell: { paddingVertical: 3, paddingRight: 6, fontSize: 8 },
  headCell: { paddingVertical: 4, paddingRight: 6, fontSize: 7, color: MUTED, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 26, left: 46, right: 46, fontSize: 7, color: MUTED },
});

/**
 * Column widths as flex weights. The first column carries the label and gets
 * the room; numeric columns need only enough for a formatted figure.
 */
function weights(count: number): number[] {
  if (count <= 1) return [1];
  return Array.from({ length: count }, (_, index) => (index === 0 ? 2.2 : 1));
}

function Table({ block }: { block: Extract<ProposalBlock, { kind: 'table' }> }) {
  const flex = weights(block.columns.length);

  return (
    <View style={{ marginTop: 8 }} wrap={false}>
      <View style={styles.headRow}>
        {block.columns.map((column, index) => (
          <Text
            key={column.heading}
            style={[
              styles.headCell,
              { flex: flex[index]!, textAlign: column.align === 'right' ? 'right' : 'left' },
            ]}
          >
            {column.heading}
          </Text>
        ))}
      </View>

      {block.rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow}>
          {row.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              style={[
                styles.cell,
                {
                  flex: flex[cellIndex]!,
                  textAlign: block.columns[cellIndex]?.align === 'right' ? 'right' : 'left',
                },
              ]}
            >
              {renderCell(cell)}
            </Text>
          ))}
        </View>
      ))}

      {block.total !== undefined && (
        <View style={styles.totalRow}>
          {block.total.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              style={[
                styles.cell,
                {
                  flex: flex[cellIndex]!,
                  fontWeight: 'bold',
                  textAlign: block.columns[cellIndex]?.align === 'right' ? 'right' : 'left',
                },
              ]}
            >
              {renderCell(cell)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Block({ block }: { block: ProposalBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <Text style={styles.paragraph}>{block.text}</Text>;

    case 'bullets':
      return (
        <View>
          {block.items.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      );

    case 'callout':
      return (
        <View
          style={[
            styles.callout,
            block.tone === 'warning'
              ? { backgroundColor: WARNING_BG, borderLeftColor: WARNING_INK }
              : { backgroundColor: NOTE_BG, borderLeftColor: MUTED },
          ]}
        >
          <Text style={{ color: block.tone === 'warning' ? WARNING_INK : MUTED }}>
            {block.text}
          </Text>
        </View>
      );

    case 'table':
      return <Table block={block} />;
  }
}

function Section({ section }: { section: ProposalSection }) {
  return (
    <View>
      <Text style={styles.heading}>{section.heading}</Text>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </View>
  );
}

export async function proposalToPdf(document: ProposalDocument): Promise<Buffer> {
  return renderToBuffer(
    <Document
      title={`${document.title} — ${document.preparedFor}`}
      author="StackFit"
      subject={document.disclaimer}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{document.title}</Text>
        <Text style={styles.subtitle}>
          Prepared for {document.preparedFor} · {document.asOf}
        </Text>
        <View style={styles.titleRule} />

        {document.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}

        {/* The disclaimer is in the assumptions section as prose, and on every
            page as a footer. A page photographed or forwarded on its own must
            still say what these numbers are. */}
        <Text style={styles.footer} fixed>
          {document.disclaimer}
        </Text>
      </Page>
    </Document>,
  );
}
