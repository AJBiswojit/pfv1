import ProductRecommendations from "./ProductRecommendations";
import { useRecommendations } from "../../hooks/useRecommendations";

const titles = {
  personalized: "Recommended for You",
  becauseViewed: "Because You Viewed",
  related: "Similar Styles",
  completeTheLook: "Complete Your Look",
  recommended: "You May Also Like",
};

export function RecommendationSectionContent({ placement, sections, status }) {
  return (
    <div data-recommendations={placement} aria-busy={status === "loading"}>
      {status === "loading" ? <span role="status" className="sr-only">Loading suggestions</span> : null}
      {Object.entries(sections).map(([name, products]) => products.length ? (
        <ProductRecommendations key={name} id={`${placement}-${name}`} eyebrow="The Discovery Edit"
          title={titles[name]} products={products} tone={name === "completeTheLook" ? "fade" : "canvas"} />
      ) : null)}
    </div>
  );
}

export default function RecommendationSections({ placement, productId, cartIds }) {
  const state = useRecommendations({ placement, productId, cartIds });
  return <RecommendationSectionContent placement={placement} {...state} />;
}
