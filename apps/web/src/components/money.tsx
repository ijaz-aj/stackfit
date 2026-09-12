import { convertMoney } from '@stackfit/engine';
import type { FxConfig, Money } from '@stackfit/schema';

import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

/**
 * A figure, with its rupee equivalent underneath where that helps.
 *
 * This tool's primary region is India, and a scenario priced in USD or EUR
 * gives an Indian reader nothing to judge the size of a number against —
 * "$1,642,766" is a quantity you have to stop and convert before it means
 * anything. The secondary line is there to give the sense of scale, not to be
 * quoted.
 *
 * Which is why it is rendered smaller, prefixed "≈", and compact: ₹16.4Cr
 * reads as an order of magnitude, and nobody mistakes it for the price. A
 * second exact figure beside the first would invite exactly that.
 *
 * Nothing appears at all when the scenario is already in rupees. Converting
 * INR to INR and printing it twice is noise.
 *
 * ⚠ The rate is the one in `data/config/fx.yaml`, read on a stated date and
 * going stale from that moment. The assumptions panel carries the date and the
 * warning; this is why the figure is approximate by construction.
 */
export function MoneyWithRupees({
  money,
  fx,
  className,
  align = 'right',
}: {
  money: Money;
  fx: FxConfig;
  className?: string;
  align?: 'right' | 'left';
}) {
  const primary = formatMoney(money);

  if (money.currency === 'INR') {
    return <span className={cn('tabular', className)}>{primary}</span>;
  }

  return (
    <span
      className={cn('flex flex-col', align === 'right' ? 'items-end' : 'items-start', className)}
    >
      <span className="tabular">{primary}</span>
      <span
        className="tabular text-faint text-2xs"
        title="Converted at the rate in the assumptions panel"
      >
        ≈ {formatMoney(convertMoney(money, 'INR', fx), { compact: true })}
      </span>
    </span>
  );
}
