import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import EmployeePage from "../../components/employee/EmployeePage";
import MediaUploadForm from "../../components/media/MediaUploadForm";
import { AtelierButton } from "../../design-system";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { PERMISSIONS } from "../../config/employeePermissions";

export default function EmployeeMediaUpload() {
  const { hasPermission } = useEmployeeAuth();
  const canUpload = hasPermission(PERMISSIONS.MEDIA_UPLOAD);
  /* Phase 13 — the product editor links here with a pre-targeted product. */
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get("product") || null;

  if (!canUpload) {
    return (
      <EmployeePage
        eyebrow="Media Operations"
        title="Upload Restricted"
        description="Permission required to upload catalogue media assets."
        actions={
          <AtelierButton as={Link} to="/employee/media" size="chip" variant="outline">
            <ArrowLeft size={13} className="mr-1 inline-block" />
            Back to Media Management
          </AtelierButton>
        }
      >
        <div className="border border-pf-border bg-pf-card p-8 text-center max-w-lg mx-auto space-y-4">
          <ShieldAlert size={32} className="mx-auto text-pf-burgundy" />
          <div className="space-y-1">
            <h3 className="font-display text-lg text-pf-text font-medium">
              Upload Permission Required
            </h3>
            <p className="font-ui text-xs text-pf-muted leading-relaxed">
              Your role allows you to view media assets in the atelier, but does not grant upload privileges. Please contact your Store Manager or Super Administrator if you require media creation access.
            </p>
          </div>
          <AtelierButton as={Link} to="/employee/media" size="chip" variant="outline">
            Return to My Media
          </AtelierButton>
        </div>
      </EmployeePage>
    );
  }

  return (
    <EmployeePage
      eyebrow="Media Operations"
      title="Upload Product Media"
      description="Submit product imagery through the real backend media pipeline. With the media.upload grant, files are stored and registered onto the chosen product immediately; no approval queue exists in this portal."
      actions={
        <AtelierButton as={Link} to="/employee/media" size="chip" variant="outline">
          <ArrowLeft size={13} className="mr-1 inline-block" />
          Back to Media Management
        </AtelierButton>
      }
    >
      <div className="border border-pf-border/80 bg-pf-card p-4 sm:p-6">
        <MediaUploadForm
          portalType="employee"
          onSuccessRedirect="/employee/media"
          initialProductId={initialProductId}
        />
      </div>
    </EmployeePage>
  );
}
