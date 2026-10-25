// A single-series bar chart over time: thin bars rounded at the data end, a
// recessive grid, a hover/focus tooltip per bar, and the same numbers as a
// table for screen readers. One measure per chart — never two y-scales.
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Bar {
  key: string;
  /** Axis label, e.g. "14:00" or "Oct 25". */
  label: string;
  value: number;
  /** Tooltip text for the value, e.g. "12.40 XLM". */
  display: string;
}

const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

export function BarChart({
  title,
  bars,
  format,
  color = "var(--chart-1)",
  className,
}: {
  title: string;
  bars: Bar[];
  /** Tick label for an axis value. */
  format: (v: number) => string;
  color?: string;
  className?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so text stays its true size.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, bars.length);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(bars.length / 8);
  const active = hover === null ? null : bars[hover];

  return (
    <figure className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <figcaption id={`${id}-t`} className="text-sm font-medium">
        {title}
      </figcaption>
      <div ref={box} className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                {t === 0 ? "0" : format(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const top = y(b.value);
            const h = Math.max(b.value > 0 ? 2 : 0, PAD.top + plotH - top);
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={b.key}>
                {/* Hit target: the whole column, wider than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill={hover === i ? "var(--muted)" : "transparent"}
                  onMouseEnter={() => setHover(i)}
                />
                {h > 0 && (
                  <path
                    d={`M${x},${PAD.top + plotH} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                    fill={color}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                    pointerEvents="none"
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            <p className="text-muted-foreground">{active.label}</p>
            <p className="font-semibold tabular">{active.display}</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
