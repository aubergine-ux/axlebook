import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';

/** Track an element's width so SVG text stays at its real size instead of scaling. */
function useWidth<T extends HTMLElement>(fallback = 720): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Small SVG charts on brand tokens. Rules (dataviz method): one axis, thin marks,
 * 2px surface gaps between stacked segments, rounded data-ends, recessive grid,
 * a legend for 2+ series, hover tooltips, and a table view next to every chart.
 * Text uses ink tokens, never series colours.
 */

export interface Series {
  key: string;
  label: string;
  /** CSS colour, e.g. var(--chart-2) */
  color: string;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Tooltip positioned at `xPct` (0–100) of the chart width, kept inside the chart. */
function Tooltip({ xPct, children }: { xPct: number; children: ReactNode }) {
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-0 z-10 min-w-40 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface-raised px-3 py-2 text-caption shadow-pop"
      style={{ left: `clamp(84px, ${xPct}%, calc(100% - 84px))` }}
    >
      {children}
    </div>
  );
}

/** Stacked columns, e.g. spending per month by category. */
export function StackedBars({
  data,
  series,
  formatValue,
  formatAxis = formatValue,
  formatLabel,
  ariaLabel,
}: {
  data: { label: string; values: Record<string, number> }[];
  series: Series[];
  formatValue: (n: number) => string;
  /** Axis ticks (e.g. compact "$2K"); defaults to formatValue. */
  formatAxis?: (n: number) => string;
  formatLabel: (label: string) => string;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 260;
  const pad = { l: 64, r: 8, t: 12, b: 28 };
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(36, band * 0.62));
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  // Thin out month labels so they never collide (~64px each).
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));

  return (
    <div className="relative" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={pad.l - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted font-mono text-[12px]"
            >
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          let acc = 0;
          const segs = series.map((s) => ({ s, v: d.values[s.key] ?? 0 })).filter((x) => x.v > 0);
          return (
            <g key={d.label}>
              {segs.map(({ s, v }, j) => {
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const top = j === segs.length - 1;
                // 2px surface gap between stacked segments.
                const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
                return top ? (
                  <path
                    key={s.key}
                    d={`M${cx - barW / 2},${y1 + h} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, barW / 2)},-${Math.min(4, h)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`}
                    fill={s.color}
                  />
                ) : (
                  <rect
                    key={s.key}
                    x={cx - barW / 2}
                    y={y1}
                    width={barW}
                    height={h}
                    fill={s.color}
                  />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[12px]">
                  {formatLabel(d.label)}
                </text>
              )}
              {/* Hit target wider than the bar. */}
              <rect
                x={cx - band / 2}
                y={pad.t}
                width={band}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip xPct={((pad.l + band * hover + band / 2) / W) * 100}>
          <p className="font-semibold">{formatLabel(data[hover].label)}</p>
          {series.map((s) => (
            <p key={s.key} className="flex justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-mono">{formatValue(data[hover]?.values[s.key] ?? 0)}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold">
            <span />
            <span className="font-mono">{formatValue(totals[hover] ?? 0)}</span>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/** One or more lines over dates, e.g. fuel economy per vehicle. */
export function LineChart({
  lines,
  formatValue,
  formatDate,
  ariaLabel,
}: {
  lines: (Series & { points: { date: string; value: number }[] })[];
  formatValue: (n: number) => string;
  formatDate: (iso: string) => string;
  ariaLabel: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<{ x: number; date: string } | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 240;
  const pad = { l: 48, r: lines.length > 1 ? 104 : 16, t: 12, b: 28 };
  const all = lines.flatMap((l) => l.points);
  if (all.length === 0) return null;
  const times = all.map((p) => Date.parse(p.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const vals = all.map((p) => p.value);
  const lo = Math.max(0, Math.floor(Math.min(...vals) * 0.9));
  const hi = Math.ceil(Math.max(...vals) * 1.05);
  const x = (iso: string) =>
    pad.l + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];

  const nearest = (px: number) => {
    let best: { x: number; date: string } | null = null;
    for (const p of all) {
      const dx = Math.abs(x(p.date) - px);
      if (!best || dx < Math.abs(best.x - px)) best = { x: x(p.date), date: p.date };
    }
    return best;
  };

  return (
    <div className="relative" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(nearest(((e.clientX - r.left) / r.width) * W));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={pad.l} y={0} width={W - pad.l - pad.r + 6} height={H} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={pad.l - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted font-mono text-[12px]"
            >
              {formatValue(t)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 8} className="fill-ink-muted text-[12px]">
          {formatDate(new Date(t0).toISOString())}
        </text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" className="fill-ink-muted text-[12px]">
          {formatDate(new Date(t1).toISOString())}
        </text>
        <g clipPath={`url(#${id}-clip)`}>
          {lines.map((l) => (
            <polyline
              key={l.key}
              points={l.points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
        {/* Direct labels at the line ends when there are a few lines. */}
        {lines.length > 1 &&
          lines.length <= 4 &&
          lines.map((l) => {
            const last = l.points.at(-1);
            return last ? (
              <text
                key={l.key}
                x={x(last.date) + 8}
                y={y(last.value)}
                dy="0.32em"
                className="fill-ink text-[12px]"
              >
                {l.label.length > 14 ? `${l.label.slice(0, 13)}…` : l.label}
              </text>
            ) : null;
          })}
        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
            {lines.map((l) => {
              const p = l.points.find((q) => q.date === hover.date);
              return p ? (
                <circle
                  key={l.key}
                  cx={x(p.date)}
                  cy={y(p.value)}
                  r={5}
                  fill={l.color}
                  stroke="var(--surface-raised)"
                  strokeWidth={2}
                />
              ) : null;
            })}
          </g>
        )}
      </svg>
      {hover && (
        <Tooltip xPct={(hover.x / W) * 100}>
          <p className="font-semibold">{formatDate(hover.date)}</p>
          {lines.map((l) => {
            const p = l.points.find((q) => q.date === hover.date);
            return p ? (
              <p key={l.key} className="flex justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: l.color }}
                  />
                  {l.label}
                </span>
                <span className="font-mono">{formatValue(p.value)}</span>
              </p>
            ) : null;
          })}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars for a ranked list (single series, so no legend). */
export function BarList({
  items,
  formatValue,
}: {
  /** `text` replaces the formatted value when the figure needs more than the number. */
  items: { key: string; label: string; value: number; text?: string }[];
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-label">{i.label}</span>
          <span className="h-2.5 rounded-r-sm bg-surface-sunken">
            <span
              className="block h-full rounded-r-sm"
              style={{ width: `${(i.value / max) * 100}%`, background: 'var(--chart-2)' }}
            />
          </span>
          <span className="font-mono text-data tabular-nums">{i.text ?? formatValue(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
