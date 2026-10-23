import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import MediaUploadForm from "../../../components/media/MediaUploadForm";
import { AtelierButton } from "../../../design-system";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { MEDIA_SCOPES } from "../../../config/mediaTypes";

export default function AdminMediaUpload() {
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  return (
    <AdminPage
      eyebrow="Business / Media"
      title="Upload Product Media"
      description="Upload images and register them against a product. Registered media are stored on the server and become visible to customers when the product is published."
      actions={
        <AtelierButton as={Link} to={`${prefix}/media`} size="chip" variant="outline">
          <ArrowLeft size={13} className="mr-1 inline-block" />
          Back to Media Management
        </AtelierButton>
      }
    >
      {/* One page title above (AdminPage). The panel keeps a single short
          second-level heading instead of repeating "Upload Product Media",
          which had produced two H1-weight titles on one screen. */}
      <AdminPanel title="Registration">
        {/* Batch 6 — this page registers PRODUCT media only: the destination
            switch is off and the form starts in the product scope. */}
        <MediaUploadForm
          portalType="admin"
          initialScope={MEDIA_SCOPES.PRODUCT}
          allowScopeChange={false}
          onSuccessRedirect={`${prefix}/media`}
        />
      </AdminPanel>
    </AdminPage>
  );
}
