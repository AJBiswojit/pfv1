/**
 * Shared create/edit workspace for Super Admin, Admin, and employees
 * who hold `products.manage`. The form is one component; only the
 * portal shell and publish capability differ.
 */

import { useSearchParams } from "react-router-dom";
import ProductEditor from "./ProductEditor";
import ProductQuickCreate from "./ProductQuickCreate";

export function useProductCreateFlow(productId) {
  const [params] = useSearchParams();
  const flow = params.get("flow");
  return productId ? flow === "quick" : flow !== "full";
}

export function productCreateTitle(productId, useQuick) {
  if (!productId) {
    return (
      <>
        New <span className="italic text-accent">product.</span>
      </>
    );
  }
  if (useQuick) {
    return (
      <>
        Add a <span className="italic text-accent">product.</span>
      </>
    );
  }
  return (
    <>
      Edit <span className="italic text-accent">product.</span>
    </>
  );
}

export function productCreateDescription(useQuick) {
  return useQuick
    ? "Name it, price it, add a cover, then submit for review. Open the complete record when you need attributes, SEO or merchandising flags."
    : "The complete merchandising record — identity, category, pricing, content, media, SEO and publishing.";
}

export default function ProductCreateWorkspace({
  productId = null,
  portal = "admin",
  basePath = "/admin",
  actor = null,
  canPublish = false,
  exitTo,
}) {
  const useQuick = useProductCreateFlow(productId);
  const key = productId ?? "new";

  return useQuick ? (
    <ProductQuickCreate
      key={key}
      productId={productId}
      portal={portal}
      basePath={basePath}
      actor={actor}
      canPublish={canPublish}
      exitTo={exitTo}
    />
  ) : (
    <ProductEditor
      key={key}
      productId={productId}
      portal={portal}
      basePath={basePath}
      actor={actor}
      canPublish={canPublish}
      exitTo={exitTo}
    />
  );
}
