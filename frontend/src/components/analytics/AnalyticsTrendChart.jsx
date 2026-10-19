import { useId } from "react";
import { formatCompactINR } from "../../utils/admin";
import { formatINR } from "../../utils/shopping";
import AnalyticsEmpty from "./AnalyticsEmpty";

/**
 * Period trend as a column chart.
 *
 * Phase 3 fix: the previous markup relied on `flex-1` inside an
 * `items-end` column, so the plot area collapsed to a hairline and every
 * bar rendered as a 2px line. The chart now gives the plot a fixed
 * pixel height, draws the gridlines, thins the x-axis ticks when the
 * period has many buckets, and shows a hover/focus value for each bar.
 * Bars are proportional to the real bucket maxima — no trend line or
 * value is invented.
 */
export default function AnalyticsTrendChart({
  series = [],
  metric = "revenue",
  emptyTitle = "No sales data for this period.",
  emptyDescription,
}) {
  const captionId = useId();
  const hasData = series.some((point) => Number(point[metric]) > 0);
  if (!series.length || !hasData) {
    return <AnalyticsEmpty title={emptyTitle} description={emptyDescription} />;
  }

  const values = series.map((point) => Number(point[metric]) || 0);
  const peak = Math.max(...values, 0);
  const formatValue = (value) =>
    metric === "revenue" || metric === "sales" ? formatCompactINR(value) : String(value);
  const formatFull = (value) =>
    metric === "revenue" || metric === "sales" ? formatINR(value) : `${value} orders`;

  /* Four gridlines including the baseline: round the axis top so the
     labels read as money rather than arbitrary decimals. */
  const axisTop = axisCeiling(peak);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(axisTop * fraction));
  /* Evenly spaced ticks with a minimum gap; the final bucket keeps its
     label only when it would not collide with the previous tick. */
  const tickStep = Math.max(1, Math.round((series.length - 1) / 6));
  const tickIndices = [];
  for (let index = 0; index < series.length; index += tickStep) tickIndices.push(index);
  const lastIndex = series.length - 1;
  if (lastIndex - tickIndices[tickIndices.length - 1] >= Math.ceil(tickStep * 0.6)) {
    tickIndices.push(lastIndex);
  }

  return (
    <div>
      <div className="flex gap-3">
        <div
          className="flex h-[228px] w-12 shrink-0 flex-col justify-between py-0.5 text-right font-ui text-[10.5px] tabular-nums text-pf-muted"
          aria-hidden="true"
        >
          {ticks.map((tick, index) => (
            <span key={`${tick}-${index}`}>{tick === 0 ? "0" : formatValue(tick)}</span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-[228px] items-end gap-[3px] border-b border-pf-border/80 sm:gap-1.5"
            role="group"
            aria-label="Period trend chart"
            aria-describedby={captionId}
          >
            {ticks.slice(0, -1).map((tick) => (
              <span
                key={`grid-${tick}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-pf-border/50"
                style={{ bottom: `${axisTop > 0 ? (tick / axisTop) * 100 : 0}%` }}
              />
            ))}
            {series.map((point, index) => {
              const value = Number(point[metric]) || 0;
              const height = axisTop > 0 ? (value / axisTop) * 100 : 0;
              const isPeak = value === peak && peak > 0;
              const label = point.shortLabel || point.day || point.date;
              return (
                <div
                  key={point.key || point.date || index}
                  tabIndex={0}
                  title={`${point.label || point.date}: ${formatFull(value)}`}
                  aria-label={`${point.label || point.date}: ${formatFull(value)}`}
                  className="group relative flex h-full min-w-0 flex-1 items-end outline-none focus-visible:ring-1 focus-visible:ring-pf-gold"
                >
                  <span
                    className={`w-full rounded-t-[2px] transition-[height,background-color] duration-300 ${
                      isPeak
                        ? "bg-pf-burgundy"
                        : index === series.length - 1
                          ? "bg-pf-burgundy/80"
                          : "bg-pf-burgundy/35 group-hover:bg-pf-burgundy/70 group-focus-visible:bg-pf-burgundy/70"
                    }`}
                    style={{ height: value > 0 ? `max(${height}%, 3px)` : "2px" }}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-pf-wine px-2 py-1 font-ui text-[10.5px] font-medium text-pf-ivory shadow-lg group-hover:block group-focus-visible:block"
                  >
                    {formatValue(value)}
                  </span>
                  <span aria-hidden="true" className="sr-only">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Ticks sit on the plot's percentage grid, not inside the
              narrow bucket columns, so labels stay legible when a
              30-day period produces 30 bars. */}
          <div className="relative mt-2 h-4" aria-hidden="true">
            {series.map((point, index) => {
              if (!tickIndices.includes(index)) return null;
              const label = point.shortLabel || point.day || point.date;
              const position = series.length > 1 ? (index / (series.length - 1)) * 100 : 50;
              return (
                <span
                  key={`x-${point.key || point.date || index}`}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-ui text-[10.5px] tabular-nums text-pf-muted"
                  style={{
                    left: `${position}%`,
                    transform: position === 0 ? "none" : position === 100 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <p id={captionId} className="sr-only">
        {metric === "revenue" ? "Revenue" : "Orders"} over the selected period.{" "}
        {series
          .map((point) => `${point.label || point.date}: ${formatFull(Number(point[metric]) || 0)}`)
          .join(". ")}
        .
      </p>
    </div>
  );
}

/** Round the axis top up to a readable value (1/2.5/5 × 10^n). */
function axisCeiling(peak) {
  if (!(peak > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const normalised = peak / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}
