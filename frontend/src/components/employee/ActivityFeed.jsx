import { getActivityLabel } from "../../services/employees/activityService";
import { formatEmployeeDateTime } from "../../utils/employee";

export default function ActivityFeed({ entries = [], empty = "No activity recorded yet." }) {
  if (!entries.length) {
    return (
      <div className="border border-pf-border/80 bg-pf-ivory/30 px-5 py-8 text-center">
        <p className="font-ui text-sm text-pf-muted">{empty}</p>
      </div>
    );
  }

  return (
    <ol className="divide-y divide-pf-border/70 border border-pf-border/80 bg-pf-ivory/30">
      {entries.map((entry) => (
        <li key={entry.id} className="px-4 py-4 sm:px-5">
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-burgundy">
            {getActivityLabel(entry.action)}
          </p>
          <p className="mt-1 font-ui text-sm text-pf-text">{entry.summary}</p>
          <p className="mt-1 font-ui text-[11px] text-pf-muted">
            {entry.actorName} · {formatEmployeeDateTime(entry.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
