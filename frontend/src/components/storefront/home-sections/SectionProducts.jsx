/**
 * PRATIKSHYA FASHION — homepage content sections (Phase 2B).
 *
 * The shared product rail every section paints from: the EXISTING Atelier
 * `ProductCard`, the EXISTING cover/media resolution (`useProductCovers`), the
 * EXISTING canonical product route (`productHref`) and the EXISTING wishlist
 * state (`useWishlist`). Nothing is re-implemented, and no second cart,
 * wishlist or pricing path is introduced.
 *
 * A card with no canonical photograph is not a product card: rows whose media
 * cannot resolve are dropped rather than showing an empty plate, so a section
 * never implies merchandise it cannot display.
 */

import { Link } from "react-router-dom";
import { Heart } from "lucide-react";

import { ProductCard } from "../../../design-system";
import { useProductCovers } from "../../../hooks/useMedia";
import { productHref } from "../../../data/products";
import { useWishlist } from "../../../context/WishlistContext";
import { cn } from "../../../utils/cn";
import "./home-sections.css";

/** One namespaced grid per rail width. Anything else falls back to four-up. */
const GRIDS = { 2: "pf-sec__grid-2", 3: "pf-sec__grid-3", 4: "pf-sec__grid-4" };

export default function SectionProducts({ products = [], columns = 4, className = "" }) {
  const wishlist = useWishlist();
  const rows = useProductCovers(products);
  const visible = rows.filter((product) => Boolean(product?.image?.src || product?.image?.url || product?.image));

  if (!visible.length) return null;

  return (
    <div className={cn(GRIDS[columns] ?? GRIDS[4], className)}>
      {visible.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          as={Link}
          to={productHref(product)}
          showCategory
          showDiscount
          onWishlist={wishlist?.toggle}
          isWishlisted={wishlist?.isSaved ? wishlist.isSaved(product) : false}
          wishlistIcon={Heart}
        />
      ))}
    </div>
  );
}
