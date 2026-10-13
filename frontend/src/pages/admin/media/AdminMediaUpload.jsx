import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import MediaUploadForm from "../../../components/media/MediaUploadForm";
import { AtelierButton } from "../../../design-system";
import { useAdminAuth } from "../../../context/AdminAuthContext";

export default function AdminMediaUpload() {
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  return (
    <AdminPage
      eyebrow="Business / Media"
      title="Upload Media"
      description="Upload and register new image and video assets for products or marketing placements across PRATIKSHYA FASHION."
      actions={
        <AtelierButton as={Link} to={`${prefix}/media`} size="chip" variant="outline">
          <ArrowLeft size={13} className="mr-1 inline-block" />
          Back to Media Management
        </AtelierButton>
      }
    >
      <AdminPanel eyebrow="Media Registration" title="Upload Assets">
        <MediaUploadForm portalType="admin" onSuccessRedirect={`${prefix}/media`} />
      </AdminPanel>
    </AdminPage>
  );
}
