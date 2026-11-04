import type { OdometerUnit } from '@axlebook/shared';
import { useFormat } from '../../lib/format';

const SIZES = {
  lg: { cell: 'h-11 w-8 text-readout-num', gap: 'gap-1', unit: 'text-figure' },
  sm: { cell: 'h-7 w-5 text-data font-semibold', gap: 'gap-0.5', unit: 'text-caption' },
} as const;

/**
 * Instrument-style odometer: zero-padded mono digit cells on the readout colour, the last
 * digit in orange (brand guide). Screen readers get the formatted value instead of the cells.
 */
export function OdometerReadout({
  value,
  unit,
  minDigits = 6,
  size = 'lg',
}: {
  value: number;
  unit: OdometerUnit;
  minDigits?: number;
  size?: keyof typeof SIZES;
}) {
  const f = useFormat();
  const digits = String(Math.max(0, Math.floor(value)))
    .padStart(minDigits, '0')
    .split('');
  const s = SIZES[size];
  const last = digits.length - 1;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="sr-only">{f.distance(value, unit)}</span>
      <span aria-hidden className={`inline-flex ${s.gap}`} data-testid="odometer-cells">
        {digits.map((d, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: digit positions are stable
            key={i}
            className={`inline-flex items-center justify-center rounded-sm font-mono font-medium tabular-nums ${s.cell} ${
              i === last ? 'bg-orange text-on-orange' : 'bg-readout text-on-readout'
            }`}
          >
            {d}
          </span>
        ))}
      </span>
      <span aria-hidden className={`font-mono text-ink-muted ${s.unit}`}>
        {unit}
      </span>
    </span>
  );
}
