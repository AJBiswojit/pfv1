import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Package } from "lucide-react";
import EmployeePage from "../../components/employee/EmployeePage";
import MediaVideo from "../../components/media/MediaVideo";
import MediaThumb, { mediaImageSource } from "../../components/media/MediaThumb";
import StatusBadge from "../../components/employee/StatusBadge";
import { AtelierButton } from "../../design-system";
import {
  MEDIA_SCOPE_LABELS,
  MEDIA_TYPES,
  formatFileSize,
  getMediaStatusLabel,
  getMediaStatusTone,
  getProductRoleLabel,
} from "../../config/mediaTypes";
import { useMediaRecord } from "../../hooks/useMedia";
import catalogRepository from "../../services/catalogRepository";
import { formatEmployeeDateTime } from "../../utils/employee";

export default function EmployeeMediaDetail() {
  const { mediaId } = useParams();
  const media = useMediaRecord(mediaId);

  const product = useMemo(
    () => (media?.productId ? catalogRepository.find(media.productId) : null),
    [media?.productId]
  );

  if (!media) {
    return (
      <EmployeePage eyebrow="Media Operations" title="Media Not Found">
        <p className="font-ui text-xs text-pf-muted">
          The requested media asset could not be found or has been removed.
        </p>
        <AtelierButton as={Link} to="/employee/media" size="chip" variant="outline" className="mt-4">
          Back to Media Management
        </AtelierButton>
      </EmployeePage>
    );
  }

  const isVid = media.type === MEDIA_TYPES.VIDEO;

  return (
    <EmployeePage
      eyebrow="Media Operations"
      title={media.title}
      description={`${isVid ? "Video Asset" : "Image Asset"} · ${product ? product.name : MEDIA_SCOPE_LABELS[media.scope]} · Submitted ${formatEmployeeDateTime(media.createdAt)}`}
      actions={
        <div className="flex items-center gap-2">
          <AtelierButton as={Link} to="/employee/media" size="chip" variant="outline">
            <ArrowLeft size={13} className="mr-1 inline-block" />
            My Media
          </AtelierButton>
          <AtelierButton as={Link} to="/employee/media/upload" size="chip">
            Upload More
          </AtelierButton>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* Preview Panel */}
        <div className="space-y-4">
          <div className="border border-pf-border/80 bg-pf-card p-4">
            {isVid ? (
              <div className="aspect-[4/5] overflow-hidden bg-pf-ivory">
                <MediaVideo
                  src={media.url}
                  poster={media.poster}
                  posterImage={mediaImageSource(media)}
                  title={media.title}
                  objectFit="contain"
                />
              </div>
            ) : (
              <MediaThumb media={media} />
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge
                label={getMediaStatusLabel(media.status)}
                tone={getMediaStatusTone(media.status)}
              />
              {media.role ? (
                <span className="rounded bg-pf-ivory px-2 py-1 font-ui text-[9px] uppercase tracking-wider text-pf-cocoa border border-pf-border">
                  {getProductRoleLabel(media.role)}
                </span>
              ) : null}
              {media.demoPlaceholder ? <StatusBadge label="Demo" tone="muted" /> : null}
            </div>
          </div>

          {/* Rejection notice if rejected */}
          {media.status === "REJECTED" ? (
            <div className="border border-pf-gold-deep/40 bg-pf-burgundy/[0.06] p-4 space-y-1.5">
              <p className="font-ui text-[10px] uppercase tracking-widest font-semibold text-pf-burgundy">
                Rejection Feedback
              </p>
              <p className="font-ui text-xs text-pf-burgundy leading-relaxed">
                {media.rejectionReason || "This asset did not meet catalogue publication standards."}
              </p>
              {media.reviewedBy ? (
                <p className="font-ui text-[10px] text-pf-muted pt-1">
                  Reviewed by {media.reviewedBy} on {formatEmployeeDateTime(media.reviewedAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Approval notice if active */}
          {media.status === "ACTIVE" ? (
            <div className="border border-emerald-300 bg-emerald-50/60 p-4 space-y-1 font-ui text-xs text-emerald-900">
              <p className="font-semibold uppercase tracking-wider text-[10px]">
                Approved & Active
              </p>
              <p className="text-[11px] text-emerald-800">
                This asset is published and visible on the PRATIKSHYA FASHION customer storefront.
              </p>
            </div>
          ) : null}
        </div>

        {/* Details and Product info */}
        <div className="space-y-6">
          <div className="border border-pf-border/80 bg-pf-card p-5 space-y-4">
            <h3 className="font-display text-base font-medium text-pf-text">Asset Metadata</h3>

            <dl className="space-y-3 font-ui text-xs divide-y divide-pf-border/60">
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">Title</dt>
                <dd className="font-medium text-pf-text text-right">{media.title}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">Alt Text</dt>
                <dd className="text-pf-cocoa text-right">{media.alt || "—"}</dd>
              </div>
              {media.caption ? (
                <div className="flex items-start justify-between gap-3 pt-2">
                  <dt className="text-pf-muted">Caption</dt>
                  <dd className="text-pf-cocoa text-right italic">&ldquo;{media.caption}&rdquo;</dd>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">File Name</dt>
                <dd className="font-mono text-[11px] text-pf-cocoa text-right">{media.fileName || "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">File Size</dt>
                <dd className="text-pf-cocoa text-right">{media.fileSize ? formatFileSize(media.fileSize) : "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">Uploaded By</dt>
                <dd className="text-pf-cocoa text-right">
                  {media.uploadedBy || "You"} {media.uploadedByEmployeeId ? `(${media.uploadedByEmployeeId})` : ""}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 pt-2">
                <dt className="text-pf-muted">Submitted At</dt>
                <dd className="text-pf-cocoa text-right">{formatEmployeeDateTime(media.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Assigned Product Card */}
          {product ? (
            <div className="border border-pf-border/80 bg-pf-card p-5 space-y-3">
              <h3 className="font-display text-base font-medium text-pf-text flex items-center gap-2">
                <Package size={16} />
                Assigned Product
              </h3>

              <div className="flex items-center gap-3 border border-pf-border/70 bg-pf-ivory/40 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-display text-sm font-medium text-pf-text">{product.name}</p>
                  <p className="font-ui text-xs text-pf-muted">
                    SKU: <span className="font-mono text-pf-cocoa">{product.sku || product.id}</span> ·{" "}
                    Category: <span className="capitalize">{product.category}</span>
                  </p>
                  <p className="font-ui text-[11px] text-pf-cocoa">
                    Price: ₹{product.price?.toLocaleString("en-IN")}
                  </p>
                </div>
                <AtelierButton
                  as={Link}
                  to={`/product/${product.slug || product.id}`}
                  target="_blank"
                  size="chip"
                  variant="outline"
                  className="shrink-0"
                >
                  <ExternalLink size={12} className="mr-1 inline" />
                  View Product
                </AtelierButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </EmployeePage>
  );
}
