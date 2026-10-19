import AdminMetricCard from "../admin/AdminMetricCard";

/**
 * Employee-portal metric tile.
 *
 * Phase 3: the Employee and Admin portals now share ONE KPI surface
 * (AdminMetricCard) so both workspaces read as a single house system.
 * Kept as a named export surface because employee desks import it widely.
 */
export default function MetricCard({ className = "", ...props }) {
  return <AdminMetricCard className={className} {...props} />;
}
