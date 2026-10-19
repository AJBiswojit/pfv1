import { cn } from "../../utils/cn";

/**
 * The shared staff operational table (both portals): ivory card surface,
 * 11px semibold column heads, 14px body, row hover — becoming a stacked
 * card list on small screens so nothing clips or overflows sideways.
 */
export default function DataTable({
  columns = [],
  rows = [],
  rowKey = "id",
  empty = "Nothing to show just now.",
  className = "",
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-pf-border bg-pf-card px-5 py-12 text-center shadow-[0_10px_40px_rgb(74_7_24/0.05)]">
        <p className="font-ui text-sm leading-relaxed text-pf-muted">{empty}</p>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-xl border border-pf-border bg-pf-card shadow-[0_10px_40px_rgb(74_7_24/0.05)]", className)}>
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="min-w-full text-left">
          <thead className="border-b border-pf-border bg-pf-ivory">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className="px-4 py-3.5 font-ui text-[11px] font-semibold uppercase tracking-[.12em] text-pf-muted"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row[rowKey] ?? index} className="border-b border-pf-border-light transition-colors last:border-0 hover:bg-pf-ivory/70">
                {columns.map((column) => (
                  <td key={column.id} className="px-4 py-4 align-top font-ui text-sm leading-relaxed text-pf-text">
                    {column.render ? column.render(row) : row[column.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-pf-border md:hidden">
        {rows.map((row, index) => (
          <li key={row[rowKey] ?? index} className="space-y-2.5 px-4 py-4">
            {columns.map((column) => (
              <div key={column.id} className="flex items-start justify-between gap-4">
                <span className="font-ui text-[11px] font-semibold uppercase tracking-[.12em] text-pf-muted">
                  {column.label}
                </span>
                <div className="min-w-0 text-right font-ui text-sm leading-relaxed text-pf-text">
                  {column.render ? column.render(row) : row[column.id]}
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
