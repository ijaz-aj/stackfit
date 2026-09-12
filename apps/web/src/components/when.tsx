'use client';

import { useEffect, useState } from 'react';

import { formatWhen } from '@/lib/format';

/**
 * When something was last touched, in the reader's own timezone.
 *
 * The timezone is why this is a client component. `updatedAt` is stored in UTC
 * and the server has no idea where the reader is, so "Today 15:27" rendered on
 * the server is "today" according to a machine in some other region. For a
 * column whose entire job is recency, being a day out is the one failure that
 * matters.
 *
 * So the server renders the absolute date, which is correct everywhere and
 * needs no clock, and the browser upgrades it to the relative form on mount.
 * `suppressHydrationWarning` covers the one frame where the two disagree by
 * design: React would otherwise report the intended difference as a bug.
 *
 * The full timestamp stays on `dateTime` and in the tooltip, so precision is
 * never actually lost, only moved out of the way.
 */
export function When({ iso }: { iso: string }) {
  const [text, setText] = useState(() => iso.slice(0, 10));

  useEffect(() => {
    setText(formatWhen(iso, new Date()));
  }, [iso]);

  return (
    <time
      dateTime={iso}
      title={iso.replace('T', ' ').slice(0, 16)}
      suppressHydrationWarning
      className="text-faint shrink-0 text-xs"
    >
      {text}
    </time>
  );
}
