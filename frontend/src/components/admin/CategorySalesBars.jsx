import { formatCompactINR } from "../../utils/admin";
import { formatINR } from "../../utils/shopping";

/**
 * Category performance — a real table (category, units sold, revenue,
 * share) with a proportional bar. Every figure comes from the dashboard
 * summary's category aggregates; share is each category's part of the
 * listed categories' combined revenue.
 *
 * Phase 3: stronger category names, tabular right-aligned figures, a
 * quieter bar track and a reconciled totals footer.
 */
const BAR_TONES = ["#65081F", "#8A3B4F", "#B98948", "#C98A5E", "#C4898A"];

export default function CategorySalesBars({ categories = [] }) {
  if (!categories.length) return null;
  const peak = Math.max(...categories.map((category) => category.sales), 0);
  const totalRevenue = categories.reduce((sum, category) => sum + (category.sales || 0), 0);
  const totalUnits = categories.reduce((sum, category) => sum + (Number(category.units) || 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left">
        <thead>
          <tr className="border-b border-pf-border">
            <th scope="col" className="py-2.5 pr-3">Category</th>
            {/* Units drop out below `sm` so the three remaining columns fit a
                320px panel without the SHARE figure being clipped. */}
            <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">Units</th>
            <th scope="col" className="px-3 py-2.5 text-right">Revenue</th>
            <th scope="col" className="px-3 py-2.5 text-right">Share</th>
            <th scope="col" className="hidden w-[26%] py-2.5 pl-4 sm:table-cell">
              <span className="sr-only">Revenue bar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category, index) => {
            const width = peak > 0 ? Math.max(4, Math.round((category.sales / peak) * 100)) : 0;
            const share = totalRevenue > 0 ? (category.sales / totalRevenue) * 100 : 0;
            return (
              <tr key={category.id} className="border-b border-pf-border-light last:border-0">
                <td className="py-3 pr-3 font-medium">{category.label}</td>
                <td className="hidden px-3 py-3 text-right tabular-nums text-pf-muted sm:table-cell">
                  {category.units ?? "—"}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  <span className="sr-only">{formatINR(category.sales)}</span>
                  <span aria-hidden="true">{formatCompactINR(category.sales)}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-pf-muted">{share.toFixed(0)}%</td>
                <td className="hidden py-3 pl-4 sm:table-cell">
                  <div className="h-1.5 w-full rounded-full bg-pf-border-light" aria-hidden="true">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, backgroundColor: BAR_TONES[index % BAR_TONES.length] }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-pf-border">
            <td className="py-2.5 pr-3 font-ui text-[11px] font-semibold uppercase tracking-[.12em] text-pf-muted">
              Total
            </td>
            <td className="hidden px-3 py-2.5 text-right font-ui text-[12.5px] font-semibold tabular-nums text-pf-text sm:table-cell">
              {totalUnits || "—"}
            </td>
            <td className="px-3 py-2.5 text-right font-ui text-[12.5px] font-semibold tabular-nums text-pf-text">
              {formatCompactINR(totalRevenue)}
            </td>
            <td className="px-3 py-2.5 text-right font-ui text-[12px] tabular-nums text-pf-muted">100%</td>
            <td className="hidden sm:table-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
