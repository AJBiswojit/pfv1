/**
 * PRATIKSHYA FASHON — Homepage hero (backend-driven).
 *
 * Hero slides come from GET /home (assembled by the backend from managed
 * marketing placements). There is no static slide registry: if the backend
 * has not curated the home hero, the carousel renders its empty state.
 */

import { getHome } from "../../services/catalog/catalogStore";

const readSlides = () => {
  const home = getHome();
  const slides = home?.heroSlides ?? home?.hero_slides ?? [];
  return (Array.isArray(slides) ? slides : []).map((slide) => ({
    id: slide.id,
    image: slide.image ?? slide.mobileImage ?? "",
    eyebrow: slide.eyebrow ?? "",
    title: slide.title ?? "",
    body: slide.subtitle ?? "",
    cta: slide.cta
      ? { label: slide.cta, href: slide.href ?? "/shop" }
      : { label: slide.subtitle ? "Explore" : "", href: slide.href ?? "/shop" },
    objectPosition: "50% center",
    tone: slide.tone ?? "light",
    mediaId: slide.mediaId ?? slide.media_id ?? null,
  })).filter((slide) => slide.id && slide.image);
};

/** Live hero slide list — re-reads whenever the catalog store updates. */
export const heroSlides = new Proxy([], {
  get: (_, prop) => {
    const list = readSlides();
    if (prop === "length") return list.length;
    if (typeof prop === "symbol") return list[prop];
    if (prop in list) return list[prop];
    const value = Reflect.get(list, prop);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

export default heroSlides;
