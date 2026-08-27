import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Film, Image as ImageIcon, Star } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import { getRegisteredProductMedia } from "../../../services/media/productMediaService";
import ProductMediaManager from "../../../components/media/ProductMediaManager";
import { resolveMediaUrl } from "../../../services/media/mediaPaths";
import { useProduct } from "../../../hooks/useProducts";
import { fetchAdminProduct } from "../../../services/admin/productAdminService";
import ProductLifecycleActions from "../../../components/admin/ProductLifecycleActions";
import { useEffect } from "react";

/**
 * PRATIKSHYA FASHON — Product media manager (Phase 7, server-backed).
 *
 * ONE product's media, exactly as the SERVER knows it:
 *
 *   · the REGISTERED panel lists the durable `media_product_media`
 *     associations (Phase 7 source of truth for new media) — upload /
 *     register / assign / cover / order all run the real backend lifecycle
 *     via ProductMediaManager, and the list is re-read from the server
 *     after every mutation (never a local echo);
 *   · the LEGACY panel shows the product's own authored image columns,
 *     read-only — the compatibility surface the 238 existing catalogue
 *     assets keep flowing through.
 *
 * Nothing on this page presents browser-local state as persisted media.
 */

const AdminProductMedia = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [productVersion, setProductVersion] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const _refreshKey = productVersion; /* re-find the record after lifecycle actions */
  const product = useProduct(productId);
  const [serverMedia, setServerMedia] = useState(null);
  const [serverMediaError, setServerMediaError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminProduct(productId).then(() => {
      if (!cancelled) setProductVersion((value) => value + 1);
    });
    getRegisteredProductMedia(productId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setServerMedia(result.items ?? []);
        setServerMediaError(null);
      } else {
        setServerMediaError(result.error ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!product) {
    return (
      <AdminPage eyebrow="Business / Media" title="Product unavailable">
        <p className="font-ui text-sm text-taupe">That product could not be found.</p>
        <Link
          to="/admin/products"
          className="mt-5 inline-block border border-ink px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ink transition-colors hover:bg-ink hover:text-ivory"
        >
          Back to the catalog
        </Link>
      </AdminPage>
    );
  }

  const registered = serverMedia ?? [];
  const registeredImages = registered.filter((item) => item.mediaType !== "video").length;
  const registeredVideos = registered.filter((item) => item.mediaType === "video").length;
  const hasCover =
    registered.some((item) => item.isPrimary) ||
    Boolean(product.image && String(product.image).trim());
  const legacyImages = [product.image, ...(product.additionalImages ?? [])].filter(Boolean);

  return (
    <AdminPage
      eyebrow="Business / Media"
      title={`${product.name} — media`}
      description={`${product.sku ?? product.id} · registered media is served from the backend media store at its canonical /media/objects/… URL. The cover is the image every card, listing and storefront page uses.`}
      actions={
        <Link
          to={`/admin/products/${productId}`}
          className="border border-mist px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ink transition-colors hover:border-ink"
        >
          Product record
        </Link>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminMetricCard
          label="Registered media"
          value={String(registered.length)}
          hint="Durable server associations"
        />
        <AdminMetricCard label="Images" value={String(registeredImages)} icon={ImageIcon} hint="Still plates" />
        <AdminMetricCard label="Videos" value={String(registeredVideos)} icon={Film} hint="Optional" />
        <AdminMetricCard
          label="Cover"
          value={hasCover ? "Set" : "Missing"}
          icon={Star}
          tone={hasCover ? "default" : "alert"}
          hint={hasCover ? "Ready for the storefront" : "Publish gate requires a cover"}
        />
      </div>

      {serverMediaError ? (
        <p className="mb-6 border border-accent/40 bg-accent/[0.05] px-4 py-3 font-ui text-[12px] text-accent" role="alert">
          The server's registered-media read model could not be loaded: {serverMediaError}
        </p>
      ) : null}

      <AdminPanel
        eyebrow="Registered media"
        title="Lifecycle: upload → register → assign → save"
        className="mb-6"
      >
        <ProductMediaManager
          productId={productId}
          scope="admin"
          onChange={() => setProductVersion((value) => value + 1)}
        />
      </AdminPanel>

      {legacyImages.length ? (
        <AdminPanel
          eyebrow="Legacy authored references"
          title="Product's own image columns"
          className="mb-6"
        >
          <p className="mb-4 font-ui text-[12px] leading-relaxed text-taupe">
            These are the authored references stored on the product record itself (the
            compatibility surface the pre-Phase-7 catalogue uses). They are shown read-only;
            new imagery should be registered above. When a product has registered associations,
            the server read model serves those first.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {legacyImages.map((reference, index) => (
              <li key={`${reference}-${index}`} className="border border-mist/80 bg-canvas">
                <img
                  src={resolveMediaUrl(reference)}
                  alt={`${product.name} reference ${index + 1}`}
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />
                <p className="truncate px-2 py-1.5 font-ui text-[10px] text-taupe" title={reference}>
                  {reference}
                </p>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      {/* Lifecycle — archive / restore stays untouched -------------------- */}
      <ProductLifecycleActions
        product={product}
        onChanged={() => setProductVersion((value) => value + 1)}
        onDeleted={() => navigate("/admin/media")}
      />
    </AdminPage>
  );
};

export default AdminProductMedia;
