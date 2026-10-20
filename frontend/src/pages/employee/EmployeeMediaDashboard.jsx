import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Eye, Layers, Plus, Search } from "lucide-react";
import EmployeePage from "../../components/employee/EmployeePage";
import MetricCard from "../../components/employee/MetricCard";
import StatusBadge from "../../components/employee/StatusBadge";
import MediaThumb from "../../components/media/MediaThumb";
import { AtelierButton } from "../../design-system";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { useMediaLibrary } from "../../hooks/useMedia";
import {
  MEDIA_STATUS,
  MEDIA_TYPES,
  getMediaStatusLabel,
  getMediaStatusTone,
  getProductRoleLabel,
} from "../../config/mediaTypes";
import { PERMISSIONS } from "../../config/employeePermissions";
import { formatEmployeeDateTime } from "../../utils/employee";
import catalogRepository from "../../services/catalogRepository";
import { cn } from "../../utils/cn";

export default function EmployeeMediaDashboard() {
  const { employee, hasPermission } = useEmployeeAuth();
  const allMedia = useMediaLibrary();

  const canUpload = hasPermission(PERMISSIONS.MEDIA_UPLOAD);
  const canManage = hasPermission(PERMISSIONS.MEDIA_MANAGE) || hasPermission(PERMISSIONS.MEDIA_EDIT);

  const [tab, setTab] = useState("MY_MEDIA");
  const [query, setQuery] = useState("");

  const myMedia = useMemo(
    () => allMedia.filter((item) => item.uploadedByEmployeeId === employee?.employeeId),
    [allMedia, employee?.employeeId]
  );

  // If the user has uploaded nothing yet in this session, show all submissions in the house or seeded items
  const employeeSubmissions = myMedia.length ? myMedia : allMedia.filter((item) => Boolean(item.uploadedByEmployeeId));

  const activeMediaPool = tab === "ALL_MEDIA" && canManage ? allMedia : employeeSubmissions;

  const metrics = useMemo(() => {
    return {
      uploaded: employeeSubmissions.length,
      totalHouse: allMedia.length,
      active: employeeSubmissions.filter((item) => item.status === MEDIA_STATUS.ACTIVE).length,
    };
  }, [employeeSubmissions, allMedia]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activeMediaPool.filter((item) => {
      if (!needle) return true;
      return [
        item.title,
        item.alt,
        item.productId,
        item.uploadedBy,
        item.uploadedByEmployeeId,
        item.fileName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [activeMediaPool, tab, query]);

  const tabs = [
    { id: "MY_MEDIA", label: "My Media", count: employeeSubmissions.length },
    ...(canManage ? [{ id: "ALL_MEDIA", label: "All House Media", count: allMedia.length }] : []),
  ];

  return (
    <EmployeePage
      eyebrow="Media Operations"
      title="Media Management"
      description="Upload, track and manage product media assets for the PRATIKSHYA FASHION catalogue and lookbooks."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canUpload ? (
            <AtelierButton
              as={Link}
              to="/employee/media/upload"
              size="chip"
              className="bg-pf-burgundy text-pf-ivory hover:bg-pf-cocoa shadow-sm"
            >
              <Plus size={13} className="mr-1 inline-block" />
              Upload Media
            </AtelierButton>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-pf-border bg-pf-ivory px-3 py-1.5 font-ui text-[10px] uppercase tracking-wider text-pf-muted">
              <Eye size={12} />
              View Only
            </span>
          )}
        </div>
      }
    >
      <p className="mb-2 text-xs text-pf-muted">Local only — not saved on the server. Counts reflect this browser session; use the upload flow to save on the server.</p>

      {/* Metrics Row — matching Section 17 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Uploaded Assets"
          value={metrics.uploaded}
          hint={canManage ? "Your submissions" : "All your uploads"}
          icon={Layers}
        />
        <MetricCard
          label="Active records"
          value={metrics.active}
          hint="Activated in this portal"
          icon={CheckCircle2}
        />
        <MetricCard
          label="All house records"
          value={metrics.totalHouse}
          hint="Local only — not saved on the server"
          icon={Clock}
        />
      </div>

      {/* Permission notice if view only */}
      {!canUpload ? (
        <div className="mb-6 flex items-center gap-3 border border-pf-border bg-pf-ivory/50 p-4 font-ui text-xs text-pf-muted">
          <Eye size={16} className="text-pf-cocoa shrink-0" />
          <p>
            Your current role has <strong>View Only</strong> access to media assets. To submit or edit media, contact your store manager or operations administrator.
          </p>
        </div>
      ) : null}

      {/* Workflow guide note */}
      <div className="mb-6 border border-pf-border/80 bg-pf-card p-4 font-ui text-xs text-pf-muted space-y-1">
        <p className="font-semibold text-pf-text uppercase tracking-wider text-[10px]">
          How media reaches the storefront
        </p>
        <p className="leading-relaxed">
          This shows this browser session only — not what is saved on the server. With the <strong>media.upload</strong> grant, use the upload flow to store and register onto the target product through the real backend pipeline.
        </p>
      </div>

      {/* Main Panel */}
      <div className="border border-pf-border/80 bg-pf-card p-4 sm:p-6 space-y-5">
        {/* Tabs & Search */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-pf-border/80 pb-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Media filter tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] border transition-colors",
                  tab === t.id
                    ? "border-pf-burgundy bg-pf-burgundy text-pf-ivory"
                    : "border-pf-border bg-pf-card text-pf-cocoa hover:border-pf-burgundy"
                )}
              >
                {t.label}
                <span className="ml-1.5 opacity-70">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-pf-muted" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or SKU..."
              className="w-full border border-pf-border bg-pf-card py-1.5 pl-8 pr-3 font-ui text-xs text-pf-text outline-none focus:border-pf-gold-deep"
            />
          </div>
        </div>

        {/* Media Grid */}
        {filtered.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => {
              const product = item.productId ? catalogRepository.find(item.productId) : null;
              const isVid = item.type === MEDIA_TYPES.VIDEO;

              return (
                <li
                  key={item.id}
                  className="flex flex-col justify-between border border-pf-border/80 bg-pf-ivory/30 p-3 transition-colors hover:border-pf-burgundy/40 hover:bg-pf-ivory/60"
                >
                  <div className="space-y-2.5">
                    {/* Thumbnail */}
                    <div className="relative">
                      <MediaThumb media={item} />
                      <span className="absolute top-2 left-2 rounded bg-pf-burgundy/80 px-1.5 py-0.5 font-ui text-[8px] uppercase tracking-wider text-pf-ivory">
                        {isVid ? "Video" : "Image"}
                      </span>
                      {item.role ? (
                        <span className="absolute bottom-2 left-2 rounded bg-pf-burgundy/85 px-1.5 py-0.5 font-ui text-[8px] uppercase tracking-wider text-pf-ivory">
                          {getProductRoleLabel(item.role)}
                        </span>
                      ) : null}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1">
                      <Link
                        to={`/employee/media/${item.id}`}
                        className="block font-display text-sm font-medium text-pf-text underline-offset-4 hover:text-pf-burgundy hover:underline line-clamp-1"
                      >
                        {item.title}
                      </Link>

                      {product ? (
                        <p className="font-ui text-[11px] text-pf-muted truncate">
                          <span className="font-mono text-pf-cocoa">{product.sku || product.id}</span> ·{" "}
                          {product.name}
                        </p>
                      ) : (
                        <p className="font-ui text-[11px] text-pf-muted">General media</p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <StatusBadge
                          label={getMediaStatusLabel(item.status)}
                          tone={getMediaStatusTone(item.status)}
                        />
                        {item.demoPlaceholder ? (
                          <StatusBadge label="Demo" tone="muted" />
                        ) : null}
                        <StatusBadge label="Local only — not saved on the server" tone="quiet" />
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-pf-border/60 pt-2 font-ui text-[10px] text-pf-muted">
                    <span>{formatEmployeeDateTime(item.createdAt)}</span>
                    <Link
                      to={`/employee/media/${item.id}`}
                      className="text-pf-cocoa hover:text-pf-burgundy underline-offset-2 hover:underline"
                    >
                      View Details →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border border-pf-border/80 bg-pf-ivory/20 p-12 text-center space-y-3">
            <Layers size={24} className="mx-auto text-pf-muted" />
            <p className="font-ui text-xs text-pf-muted">
              {query
                ? `No submissions found matching "${query}".`
                : "No media records yet. Product uploads go through the backend media pipeline once your account holds the media.upload grant."}
            </p>
            {canUpload ? (
              <div className="pt-2">
                <AtelierButton as={Link} to="/employee/media/upload" size="chip">
                  <Plus size={12} className="mr-1 inline-block" />
                  Upload First Asset
                </AtelierButton>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </EmployeePage>
  );
}
