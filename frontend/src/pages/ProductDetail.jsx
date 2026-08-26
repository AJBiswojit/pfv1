import { motion } from "framer-motion";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  apiGetProduct,
  apiGetRecommendations,
  apiAdminGetProduct,
  apiAddRecentlyViewed,
} from "../services/api/productsApi";
import { getAccessToken } from "../services/api/apiClient";
import {
  AtelierButton,
  AtelierSection,
  Breadcrumb,
  EmptyState,
  EditorialHeading,
  MediaFrame,
  PageHeader,
  ProductGridSkeleton,
  useReveal,
} from "../design-system";
import ProductDetailsAccordion from "../components/product/ProductDetailsAccordion";
import ProductGallery from "../components/product/ProductGallery";
import ProductPurchasePanel from "../components/product/ProductPurchasePanel";
import ProductRecommendations from "../components/product/ProductRecommendations";
import { imageRef } from "../data/mediaPlaceholder";

function ProductNotFound() {
  return (
    <>
      <PageHeader
        eyebrow="The Collection"
        title="This piece is no longer in the collection."
        breadcrumb={[{ label: "Shop", to: "/shop" }, { label: "Piece Unavailable" }]}
        size="subsection"
      />
      <AtelierSection rhythm="none" width="wide" className="pb-24 md:pb-36">
        <div className="grid overflow-hidden bg-surface md:grid-cols-2">
          <MediaFrame
            image={imageRef("saree-banarasi")}
            alt="PRATIKSHYA FASHON heritage textile detail"
            aspect="portrait"
            overlay="imageBottom"
            className="min-h-72 md:min-h-[32rem]"
          />
          <EmptyState
            eyebrow="A Changing Atelier"
            title="Another heirloom is waiting."
            description="Our edits are made in considered numbers. Return to the house collection, or begin with the sarees currently on the rail."
            className="px-7"
            actions={
              <>
                <AtelierButton as={Link} to="/shop" variant="primary" size="md">Return to Shop</AtelierButton>
                <AtelierButton as={Link} to="/category/sarees" variant="outline" size="md">Explore Sarees</AtelierButton>
              </>
            }
          />
        </div>
      </AtelierSection>
    </>
  );
}

function ProductLoadError({ message, onRetry }) {
  return (
    <>
      <PageHeader
        eyebrow="The Collection"
        title="We couldn't load this piece."
        breadcrumb={[{ label: "Shop", to: "/shop" }, { label: "Piece Unavailable" }]}
        size="subsection"
      />
      <AtelierSection rhythm="none" width="wide" className="pb-24 md:pb-36">
        <EmptyState
          eyebrow="Something Went Wrong"
          title="The piece could not be fetched"
          description={message}
          className="mx-auto max-w-xl"
          actions={
            <>
              <AtelierButton onClick={onRetry} variant="outline" size="md">Try again</AtelierButton>
              <AtelierButton as={Link} to="/shop" variant="primary" size="md">Return to Shop</AtelierButton>
            </>
          }
        />
      </AtelierSection>
    </>
  );
}

export default function ProductDetail() {
  const { productId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState({ related: [], completeTheLook: [], recommended: [] });
  const [status, setStatus] = useState("loading"); // loading | ready | error | notfound
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const { user } = useAuth();
  const reveal = useReveal();

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    const load = async () => {
      let result;
      if (isPreview && getAccessToken("admin")) {
        result = await apiAdminGetProduct(productId);
      } else {
        result = await apiGetProduct(productId);
      }

      if (cancelled) return;

      if (!result.ok) {
        setStatus(result.status === 404 ? "notfound" : "error");
        setError(result.error);
        return;
      }

      setProduct(result.product);
      setStatus("ready");

      const recResult = await apiGetRecommendations(result.product.id, "related");
      if (!cancelled && recResult.ok && recResult.items?.length) {
        const items = recResult.items;
        setRecommendations({
          related: items.slice(0, 4),
          completeTheLook: items.slice(4, 8),
          recommended: items.slice(8, 12),
        });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [productId, isPreview, attempt]);

  /* A record that is not yet published is an atelier preview — visible by
     direct product id, honestly labelled, never offered for purchase. */
  const isAtelierPreview =
    isPreview || product?.status === "DRAFT" || product?.published === false;

  useEffect(() => {
    if (!product) return undefined;
    const previousTitle = document.title;
    document.title = `${product.name} — PRATIKSHYA FASHON`;
    return () => { document.title = previousTitle; };
  }, [product]);

  useEffect(() => {
    if (!product || isAtelierPreview) return undefined;
    if (user?.id && getAccessToken()) apiAddRecentlyViewed(product.id);
    return undefined;
  }, [product, isAtelierPreview, user?.id]);

  if (status === "loading") {
    return (
      <main className="pb-20 md:pb-0">
        <AtelierSection rhythm="none" width="wide" className="pb-16 pt-28 sm:pt-32 md:pb-24">
          <div className="grid gap-11 md:grid-cols-2 md:gap-7 lg:grid-cols-12 lg:gap-12 xl:gap-16">
            <div className="min-w-0 lg:col-span-7"><ProductGridSkeleton count={2} /></div>
            <div className="min-w-0 lg:col-span-5"><ProductGridSkeleton count={4} /></div>
          </div>
        </AtelierSection>
      </main>
    );
  }

  if (status === "error") {
    return <ProductLoadError message={error ?? "The catalogue is unreachable. Please try again."} onRetry={() => setAttempt((a) => a + 1)} />;
  }

  if (status === "notfound" || !product) return <ProductNotFound />;

  const categoryPath = `/category/${product.slug || product.category}`;
  const subcategoryPath = `${categoryPath}?subcategory=${encodeURIComponent(product.subcategory)}`;
  const breadcrumbs = [
    { label: "Shop", to: "/shop" },
    { label: product.categoryLabel || product.category, to: categoryPath },
    { label: product.subcategory || "Piece", to: subcategoryPath },
    { label: product.name },
  ];

  const storyLine = (() => {
    const home = product.collection || product.categoryLabel || "the atelier";
    const cloth = [product.fabric, product.material].filter(Boolean);
    const parts = [`From ${home}`];
    if (cloth.length) parts.push(`a study in ${cloth.join(" and ").toLowerCase()}`);
    return `${parts.join(", ")}.`;
  })();

  const emptyRecommendation = () => ({
    eyebrow: "More to Discover",
    title: <>You may also <span className="italic text-accent">like</span></>,
    description: "Similar pieces will appear here as more of the collection is catalogued.",
  });

  return (
    <main className="pb-20 md:pb-0">
      {isAtelierPreview ? (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 bg-ink px-4 py-2 text-center font-ui text-[10px] uppercase tracking-[.22em] text-ivory"
        >
          Atelier preview — this piece is not yet visible to customers
        </div>
      ) : null}
      <AtelierSection rhythm="none" width="wide" className="pb-16 pt-28 sm:pt-32 md:pb-24">
        <Breadcrumb items={breadcrumbs} separator="/" className="mb-8 md:mb-10" />

        <div className="grid gap-11 md:grid-cols-2 md:gap-7 lg:grid-cols-12 lg:gap-12 xl:gap-16">
          <div className="min-w-0 lg:col-span-7">
            <ProductGallery product={product} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <ProductPurchasePanel product={product} />
          </div>
        </div>
      </AtelierSection>

      <AtelierSection id="product-details" tone="fade" rhythm="default" width="wide">
        <div className="grid gap-12 md:grid-cols-12 md:gap-10 lg:gap-16">
          <motion.div {...reveal} className="md:col-span-4">
            <EditorialHeading
              as="h2"
              size="subsection"
              eyebrow="About the Piece"
              description={storyLine}
              descriptionClassName="max-w-sm font-display text-xl leading-relaxed text-graphite"
              rule
              spacing={{ eyebrow: "mb-4", title: "mb-5", rule: "mb-6" }}
            >
              The story is in the <span className="italic text-accent">making.</span>
            </EditorialHeading>
            <div className="mt-10 border-l border-gold pl-5">
              <p className="font-display text-2xl text-ink">{Number(product.rating ?? 0).toFixed(1)}</p>
              <p className="mt-1 font-ui text-[9px] uppercase tracking-[.17em] text-taupe">
                From {Number(product.reviewCount ?? 0).toLocaleString("en-IN")} considered reviews
              </p>
            </div>
          </motion.div>

          <motion.div {...reveal} className="md:col-span-7 md:col-start-6">
            <ProductDetailsAccordion product={product} />
          </motion.div>
        </div>
      </AtelierSection>

      <ProductRecommendations
        id="related-products"
        eyebrow="In the Same Story"
        title={<>Related <span className="italic text-accent">pieces</span></>}
        description="Selected through shared cloth, craft, collection and occasion — never at random."
        products={recommendations.related}
        empty={emptyRecommendation()}
      />

      <ProductRecommendations
        id="complete-the-look"
        eyebrow="The Styling Edit"
        title={<>Complete the <span className="italic text-accent">look</span></>}
        description="A composed edit of finishing pieces chosen to sit naturally beside this silhouette."
        products={recommendations.completeTheLook}
        tone="fade"
        empty={emptyRecommendation()}
      />

      <ProductRecommendations
        id="recommended-products"
        eyebrow="More to Discover"
        title={<>You may also <span className="italic text-accent">like</span></>}
        description="Similar in occasion, palette and price — with no repetition from the edits above."
        products={recommendations.recommended}
        empty={emptyRecommendation()}
      />
    </main>
  );
}
