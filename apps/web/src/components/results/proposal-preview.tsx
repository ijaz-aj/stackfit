import type { ProposalBlock, ProposalDocument } from '@stackfit/engine';

import { renderCell } from '@/lib/proposal.server';

/**
 * §8's proposal, on screen.
 *
 * The spec asks for an HTML preview before the DOCX and the PDF, and the reason
 * is the one that matters on a call: an analyst will not send a client a file
 * they have not read. This is that read.
 *
 * It renders the same document model the DOCX and PDF renderers do, through the
 * same `renderCell`, so what an analyst checks here is what the client receives
 * rather than a separate approximation of it.
 *
 * Deliberately plain: white page, black text, print-friendly. Everything else
 * in this app is a dark working tool; this is the thing that leaves the
 * building.
 */
function Block({ block }: { block: ProposalBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="mt-2 text-[12px] leading-relaxed text-neutral-700">{block.text}</p>;

    case 'bullets':
      return (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-neutral-700">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );

    case 'callout':
      return (
        <p
          className={`mt-3 rounded border-l-2 px-3 py-2 text-[11px] leading-relaxed ${
            block.tone === 'warning'
              ? 'border-amber-600 bg-amber-50 text-amber-900'
              : 'border-neutral-400 bg-neutral-50 text-neutral-700'
          }`}
        >
          {block.text}
        </p>
      );

    case 'table':
      return (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[10px] tracking-wide text-neutral-500 uppercase">
                {block.columns.map((column) => (
                  <th
                    key={column.heading}
                    className={`py-1.5 pr-3 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    {column.heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-neutral-200">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`py-1.5 pr-3 align-top text-neutral-800 ${
                        block.columns[cellIndex]?.align === 'right' ? 'tabular text-right' : ''
                      }`}
                    >
                      {renderCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
              {block.total !== undefined && (
                <tr className="border-t-2 border-neutral-400 font-semibold text-neutral-900">
                  {block.total.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`py-1.5 pr-3 ${
                        block.columns[cellIndex]?.align === 'right' ? 'tabular text-right' : ''
                      }`}
                    >
                      {renderCell(cell)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
  }
}

export function ProposalPreview({ document }: { document: ProposalDocument }) {
  return (
    <article className="mx-auto w-full max-w-[820px] bg-white px-10 py-9 text-neutral-900 shadow-sm print:shadow-none">
      <header className="border-b border-neutral-300 pb-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{document.title}</h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          Prepared for {document.preparedFor} · {document.asOf}
        </p>
      </header>

      {document.sections.map((section) => (
        <section key={section.heading} className="mt-7 break-inside-avoid">
          <h2 className="border-b border-neutral-200 pb-1 text-[14px] font-semibold tracking-tight">
            {section.heading}
          </h2>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}
    </article>
  );
}
